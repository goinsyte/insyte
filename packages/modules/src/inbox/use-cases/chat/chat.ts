import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, type Principal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import {
  type ChatAuthor,
  type ChatMessage,
  type ChatThread,
  TakenOver,
  ThreadClosed
} from "../../../shared/domain/ChatChannel.ts"
import { UndoWindow } from "../../../shared/domain/Undo.ts"
import * as Audit from "../../../shared/use-cases/Audit.ts"
import * as Outbox from "../../../shared/use-cases/Outbox.ts"
import { inScope } from "../../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../../shared/use-cases/Undo.ts"
import { ChatRestore, HandoverChange } from "../../domain/Chat.ts"
import { textRefused } from "../../domain/ChatKinds.ts"
import { MessageQueued, type MessageView } from "../../domain/Inbox.ts"
import { previewOf } from "../inbound.ts"
import { chatDraftOf, rowsOf } from "../threads.ts"
import { restoreChannel } from "./channels.ts"

/*
 * The website chat on the team's side (M15 step 8): a reply in a chat, "Overnemen" and "Teruggeven aan Insyte", the
 * agent's handover, binding a chat to its customer, and the reads the customer agent takes (`ChatChannel`). Every
 * thread is its store's: one outside the principal's stores is not found.
 *
 * A reply waits out the undo window before the shopper sees it (`visible_at`): Undo takes it away before then, so it
 * never reached them. Words are never logged: the audit names the message, not what it says.
 */

export const CHAT_RESTORE = "chat.restore"

interface Held {
  readonly id: string
  readonly workspaceId: string
  readonly storeId: string
  readonly customerId: string | null
  readonly assigneeId: string | null
  readonly takenOverBy: string | null
  readonly takenOverAt: Date | null
  readonly handedBackAt: Date | null
  readonly closedAt: Date | null
  readonly deletedAt: Date | null
  readonly lastMessageAt: Date
  readonly lastMessagePreview: string
  readonly live: boolean
}

/** The chat, locked, where the principal reaches its store. */
export const holdChat = Effect.fn("Chat.hold")(function*(sql: SqlClient.SqlClient, threadId: string) {
  const [row] = yield* sql<Held>`
    select t.id, t.workspace_id, t.store_id, t.customer_id, t.assignee_id, t.taken_over_by, t.taken_over_at,
           t.handed_back_at, t.closed_at, t.deleted_at, t.last_message_at, t.last_message_preview,
           (select c.status = 'connected' from channels c where c.id = t.channel_id) as live
    from channel_threads t where t.id = ${threadId} and ${yield* inScope(sql, "t.store_id")} for update of t`
  if (row === undefined) return yield* new NotFound({ entity: "thread", id: threadId })
  return row
})

/** Whether `threadId` is a chat the principal reaches. */
export const isChat = (sql: SqlClient.SqlClient, threadId: string) =>
  Effect.map(
    sql<{ id: string }>`select id from channel_threads where id = ${threadId}`,
    (rows) => rows.length > 0
  )

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "thread",
        subjectId: id,
        diff
      })
  )

const authorOf = (p: Principal): ChatAuthor => p.kind === "agent" ? "agent" : p.kind === "system" ? "system" : "team"

/** A text as either side may write it: trimmed, not empty, not too long. */
export const checkText = (text: string) => {
  const t = text.trim()
  const why = textRefused(t)
  return why === undefined ? Effect.succeed(t) : Effect.fail(new Invalid({ fields: { body: why } }))
}

/**
 * One reply in a chat, as the principal, on the caller's transaction, without an undo token of its own: the team's or
 * the agent's. Refused while another holds the thread, and once it is closed or its store's chat is off.
 */
export const replyIn = Effect.fn("Chat.replyIn")(function*(sql: SqlClient.SqlClient, threadId: string, text: string) {
  const principal = yield* CurrentPrincipal
  const body = yield* checkText(text)
  const held = yield* holdChat(sql, threadId)
  if (held.closedAt !== null || held.deletedAt !== null || !held.live) {
    return yield* new ThreadClosed({ threadId })
  }
  if (held.takenOverBy !== null && !(principal.kind === "member" && principal.id === held.takenOverBy)) {
    return yield* new TakenOver({ threadId })
  }
  const id = mintId("chm")
  const author = authorOf(principal)
  const window = yield* UndoWindow
  // The thread's last word is the message's own time, as Postgres wrote it: Undo knows the reply is still last by it.
  const [sent] = yield* sql<{ at: string }>`
    insert into channel_messages (id, workspace_id, thread_id, author, sent_by, body, visible_at)
    values (${id}, ${principal.workspaceId}, ${threadId}, ${author}, ${principal.id}, ${body},
            now() + make_interval(secs => ${window}))
    returning created_at::text as at`
  yield* sql`update channel_threads set last_message_at = ${sent!.at}::timestamptz,
               last_message_preview = ${previewOf(body)},
               unread = false, agent_spoke_at = case when ${author} = 'agent' then now() else agent_spoke_at end
             where id = ${threadId}`
  yield* audit(sql, "thread.replied", threadId, { messageId: id })
  const compensation: ChatRestore = {
    kind: "unsent",
    messageId: id,
    threadId,
    lastMessageAt: held.lastMessageAt.getTime(),
    preview: held.lastMessagePreview,
    sentAt: sent!.at
  }
  return { id, body, compensation }
})

/** The team's reply as the inbox's letter answers it: the thread, the message waiting out its window, its Undo. */
export const reply = Effect.fn("Chat.reply")(function*(input: { readonly threadId: string; readonly body: string }) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const made = yield* replyIn(sql, input.threadId, input.body)
      const undo = yield* Undo.issue(sql, { command: CHAT_RESTORE, compensation: made.compensation })
      const [thread] = yield* rowsOf(sql, [input.threadId])
      const principal = yield* CurrentPrincipal
      const message: MessageView = {
        id: made.id,
        direction: "outbound",
        kind: "reply",
        from: { name: "", email: "" },
        to: [],
        cc: [],
        subject: "",
        bodyText: made.body,
        hasHtml: false,
        sentAt: Date.now(),
        sentBy: principal.id,
        sendState: "scheduled",
        sendError: null,
        attachments: []
      }
      return new MessageQueued({ thread: thread!, message, undo })
    })
  )
})

/* ── the customer agent's draft ─────────────────────────────────────────────────────────────────── */

/**
 * The chat's open draft, held, when it is `draftId`: the chat must be the principal's to reach (`holdChat`), and the
 * draft still what its letter shows (`chatDraftOf`). One used, thrown away, answered since or replaced by a newer is a
 * `Conflict` "gone": someone was first.
 */
const holdDraft = (sql: SqlClient.SqlClient, input: { readonly threadId: string; readonly draftId: string }) =>
  Effect.gen(function*() {
    const held = yield* holdChat(sql, input.threadId)
    const draft = yield* chatDraftOf(sql, held.id)
    if (draft === null || draft.id !== input.draftId) {
      return yield* new Conflict({ entity: "draft", reason: "gone" })
    }
    yield* sql`select id from drafts where id = ${draft.id} for update`
    return { held, draft }
  })

/**
 * "Versturen" on the agent's draft: the team's reply with the draft's words, its Undo as any reply's (the draft open
 * again once the reply is taken away), and the draft used.
 */
export const sendDraft = Effect.fn("Threads.sendDraft")(function*(
  input: { readonly threadId: string; readonly draftId: string }
) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const { draft } = yield* holdDraft(sql, input)
      const made = yield* replyIn(sql, input.threadId, draft.text)
      yield* sql`update drafts set used_at = now() where id = ${draft.id}`
      const undo = yield* Undo.issue(sql, {
        command: CHAT_RESTORE,
        compensation: { ...made.compensation, draftId: draft.id } satisfies ChatRestore
      })
      return yield* changedWith(sql, input.threadId, undo)
    })
  )
})

/** "Aanpassen": the draft's words go into the composer, and the draft is used, as "Concept gebruiken" is for mail. */
export const useDraft = Effect.fn("Threads.useDraft")(function*(
  input: { readonly threadId: string; readonly draftId: string }
) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const { draft } = yield* holdDraft(sql, input)
      yield* sql`update drafts set used_at = now() where id = ${draft.id}`
      return yield* changedWith(sql, input.threadId, null)
    })
  )
})

/** "Weggooien": the draft leaves the letter, with its Undo. */
export const discardDraft = Effect.fn("Threads.discardDraft")(function*(
  input: { readonly threadId: string; readonly draftId: string }
) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const { draft } = yield* holdDraft(sql, input)
      yield* sql`update drafts set discarded_at = now() where id = ${draft.id}`
      yield* audit(sql, "thread.draft_discarded", input.threadId, { draftId: draft.id })
      const undo = yield* Undo.issue(sql, {
        command: CHAT_RESTORE,
        compensation: { kind: "draft", threadId: input.threadId, draftId: draft.id } satisfies ChatRestore
      })
      return yield* changedWith(sql, input.threadId, undo)
    })
  )
})

interface OpenHandover {
  readonly id: string
  readonly pickedUpAt: Date | null
  readonly pickedUpBy: string | null
  readonly handedBackAt: Date | null
  readonly handedBackBy: string | null
}

const openHandover = (sql: SqlClient.SqlClient, threadId: string) =>
  Effect.map(
    sql<OpenHandover>`select id, picked_up_at, picked_up_by, handed_back_at, handed_back_by from handovers
                      where thread_id = ${threadId} and handed_back_at is null for update`,
    (rows) => rows[0]
  )

const ms = (d: Date | null) => d?.getTime() ?? null

const holder = (held: Held, h: OpenHandover | undefined): ChatRestore => ({
  kind: "holder",
  threadId: held.id,
  takenOverBy: held.takenOverBy,
  takenOverAt: ms(held.takenOverAt),
  handedBackAt: ms(held.handedBackAt),
  assigneeId: held.assigneeId,
  handover: h === undefined ? null : {
    id: h.id,
    pickedUpAt: ms(h.pickedUpAt),
    pickedUpBy: h.pickedUpBy,
    handedBackAt: ms(h.handedBackAt),
    handedBackBy: h.handedBackBy
  }
})

const changedWith = (sql: SqlClient.SqlClient, threadId: string, undo: HandoverChange["undo"]) =>
  Effect.map(rowsOf(sql, [threadId]), ([thread]) => new HandoverChange({ thread: thread!, undo }))

const changed = (sql: SqlClient.SqlClient, threadId: string, compensation: ChatRestore | null) =>
  Effect.gen(function*() {
    const undo = compensation === null ? null : yield* Undo.issue(sql, { command: CHAT_RESTORE, compensation })
    return yield* changedWith(sql, threadId, undo)
  })

/** "Overnemen": the chat is mine; the agent is silent on it until I hand it back. */
export const takeOver = Effect.fn("Threads.takeOver")(function*(input: { readonly threadId: string }) {
  yield* Policy.require("support", 2)
  const principal = yield* CurrentPrincipal
  if (principal.kind !== "member") return yield* new NotFound({ entity: "thread", id: input.threadId })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const held = yield* holdChat(sql, input.threadId)
      if (held.takenOverBy === principal.id) return yield* changed(sql, held.id, null)
      const h = yield* openHandover(sql, held.id)
      yield* sql`update channel_threads set taken_over_by = ${principal.id}, taken_over_at = now(),
                   assignee_id = ${principal.id} where id = ${held.id}`
      if (h !== undefined) {
        yield* sql`update handovers set picked_up_at = now(), picked_up_by = ${principal.id} where id = ${h.id}`
      }
      yield* audit(sql, "thread.taken_over", held.id, { from: held.takenOverBy })
      return yield* changed(sql, held.id, holder(held, h))
    })
  )
})

/** "Teruggeven aan Insyte": nobody holds the chat any more, and the handover is closed. */
export const handBack = Effect.fn("Threads.handBack")(function*(input: { readonly threadId: string }) {
  yield* Policy.require("support", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const held = yield* holdChat(sql, input.threadId)
      const h = yield* openHandover(sql, held.id)
      if (held.takenOverBy === null && h === undefined) return yield* changed(sql, held.id, null)
      // Kept on the thread, not only on a handover: a take-over and hand-back with none open leave their mark too.
      yield* sql`update channel_threads set taken_over_by = null, taken_over_at = null, assignee_id = null,
                   handed_back_at = now()
                 where id = ${held.id}`
      if (h !== undefined) {
        yield* sql`update handovers set handed_back_at = now(), handed_back_by = ${principal.id} where id = ${h.id}`
      }
      yield* audit(sql, "thread.handed_back", held.id, { from: held.takenOverBy })
      return yield* changed(sql, held.id, holder(held, h))
    })
  )
})

/* ── the customer agent's port (`ChatChannel`) ──────────────────────────────────────────────────── */

/** Read as `NotFound`: a principal that may not read the inbox does not see the thread at all. */
const reading = <A, E, R>(threadId: string, effect: Effect.Effect<A, E, R>) =>
  Policy.require("support", 1).pipe(
    Effect.catchTag("Forbidden", () => Effect.fail(new NotFound({ entity: "thread", id: threadId }))),
    Effect.andThen(effect)
  )

export const thread = Effect.fn("Chat.thread")(function*(threadId: string) {
  const db = yield* Db
  return yield* reading(
    threadId,
    db.scoped((sql) =>
      Effect.gen(function*() {
        const [row] = yield* sql<{
          workspaceId: string
          storeId: string
          kind: "webchat"
          customerId: string | null
          takenOverBy: string | null
          handedBackAt: Date | null
          closedAt: Date | null
          reason: string | null
          at: Date | null
        }>`
          select t.workspace_id, t.store_id, t.kind, t.customer_id, t.taken_over_by, t.handed_back_at, t.closed_at, h.reason,
                 h.at
          from channel_threads t left join handovers h on h.thread_id = t.id and h.handed_back_at is null
          where t.id = ${threadId} and ${yield* inScope(sql, "t.store_id")}`
        if (row === undefined) return yield* new NotFound({ entity: "thread", id: threadId })
        return {
          workspaceId: row.workspaceId,
          storeId: row.storeId,
          channel: row.kind,
          customerId: row.customerId,
          handover: row.reason === null || row.at === null ? null : { reason: row.reason, at: row.at },
          takenOverBy: row.takenOverBy,
          handedBackAt: row.handedBackAt,
          closedAt: row.closedAt
        } satisfies ChatThread
      })
    )
  )
})

export const history = Effect.fn("Chat.history")(function*(threadId: string, limit: number) {
  const db = yield* Db
  return yield* reading(
    threadId,
    db.scoped((sql) =>
      Effect.gen(function*() {
        const [t] = yield* sql`select 1 from channel_threads t
                               where t.id = ${threadId} and ${yield* inScope(sql, "t.store_id")}`
        if (t === undefined) return yield* new NotFound({ entity: "thread", id: threadId })
        const rows = yield* sql<{ id: string; author: ChatAuthor; body: string; createdAt: Date }>`
          select * from (
            select id, author, body, created_at from channel_messages
            where thread_id = ${threadId} and visible_at <= now()
            order by created_at desc, id desc limit ${Math.max(1, Math.min(limit, 200))}
          ) m order by created_at, id`
        return rows.map((m): ChatMessage => ({ id: m.id, author: m.author, text: m.body, at: m.createdAt }))
      })
    )
  )
})

/** The agent's (or a member's) reply through the port: no undo token is handed out here. */
export const replyAs = Effect.fn("Chat.replyAs")(function*(threadId: string, text: string) {
  yield* Policy.require("support", 2)
  const db = yield* Db
  const made = yield* db.scoped((sql) => replyIn(sql, threadId, text))
  return { messageId: made.id }
})

/** The agent passes the chat to a person: the Overgedragen view, and the team that reaches its store hears of it. */
export const handOver = Effect.fn("Chat.handOver")(function*(threadId: string, reason: string) {
  // The seam has no refusal for the reason: it is the team's note, so an empty one says so and a long one is cut.
  const trimmed = reason.trim()
  const why = trimmed === "" ? "Geen reden opgegeven" : trimmed.length > 500 ? `${trimmed.slice(0, 499)}…` : trimmed
  const db = yield* Db
  yield* reading(
    threadId,
    db.scoped((sql) =>
      Effect.gen(function*() {
        const principal = yield* CurrentPrincipal
        const held = yield* holdChat(sql, threadId)
        const open = yield* openHandover(sql, threadId)
        if (open !== undefined) return
        yield* sql`insert into handovers (id, workspace_id, thread_id, reason, by_kind, by_id)
                   values (${mintId("hnd")}, ${principal.workspaceId}, ${threadId}, ${why}, ${principal.kind},
                           ${principal.id})`
        yield* sql`update channel_threads set unread = true where id = ${threadId}`
        yield* audit(sql, "thread.handed_over", threadId)
        yield* Outbox.write(sql, principal.workspaceId, {
          type: "chat.handed_over",
          workspaceId: principal.workspaceId,
          storeId: held.storeId,
          threadId
        })
      })
    )
  )
})

/** The chat is a verified customer's of its own store: their name in the inbox, and their order on the chip. */
export const bindCustomer = Effect.fn("Chat.bindCustomer")(function*(threadId: string, customerId: string) {
  // Binding says who the shopper is: the workspace's agent, once it proved it, or a person who may answer chats.
  const principal = yield* CurrentPrincipal
  if (principal.kind !== "agent") {
    yield* Policy.require("support", 2).pipe(
      Effect.catchTag("Forbidden", () => Effect.fail(new NotFound({ entity: "thread", id: threadId })))
    )
  }
  const db = yield* Db
  yield* reading(
    threadId,
    db.scoped((sql) =>
      Effect.gen(function*() {
        const held = yield* holdChat(sql, threadId)
        const [customer] = yield* sql<{ name: string; email: string | null }>`
          select name, email from customers
          where id = ${customerId} and store_id = ${held.storeId} and deleted_at is null`
        if (customer === undefined) return yield* new NotFound({ entity: "customer", id: customerId })
        if (held.customerId === customerId) return
        const party = [{ name: customer.name.trim() || "Websitebezoeker", email: customer.email ?? "", team: false }]
        yield* sql`update channel_threads set customer_id = ${customerId},
                     participants = ${JSON.stringify(party)}::jsonb where id = ${threadId}`
        yield* audit(sql, "thread.customer_bound", threadId, { customerId })
      })
    )
  )
})

/* ── Undo ──────────────────────────────────────────────────────────────────────────────────────── */

const decodeRestore = Schema.decodeUnknownEffect(ChatRestore)
const at = (n: number | null) => (n === null ? null : new Date(n))

/** `Shared.undo`'s compensation for `chat.restore`: a reply that never reached the shopper, a holder as it was. */
export const restore = Effect.fn("Chat.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require(undo.kind === "channel" ? "integrations" : "support", 2)
  switch (undo.kind) {
    case "unsent": {
      // Only while it still waits: once the shopper may have read it, it stays.
      // The preview goes back only while the reply is still the thread's last word: one the shopper wrote since stays.
      // Compared in Postgres, to the microsecond: a time through JavaScript keeps only milliseconds.
      yield* sql`
        with gone as (
          delete from channel_messages where id = ${undo.messageId} and visible_at > now() returning created_at
        )
        update channel_threads t set last_message_at = ${new Date(undo.lastMessageAt)},
          last_message_preview = ${undo.preview}
        from gone
        where t.id = ${undo.threadId}
          and t.last_message_at = coalesce(${undo.sentAt ?? null}::timestamptz, gone.created_at)`
      // The agent's draft it sent is open again, once the reply is gone: the team may still send it, or not.
      if (undo.draftId !== undefined) {
        yield* sql`update drafts set used_at = null
                   where id = ${undo.draftId}
                     and not exists (select 1 from channel_messages where id = ${undo.messageId})`
      }
      yield* audit(sql, "thread.unsent", undo.threadId, { messageId: undo.messageId })
      return
    }
    case "draft": {
      yield* sql`update drafts set discarded_at = null
                 where id = ${undo.draftId} and subject_type = 'chat' and subject_id = ${undo.threadId}`
      yield* audit(sql, "thread.draft_restored", undo.threadId, { draftId: undo.draftId })
      return
    }
    case "holder": {
      yield* sql`update channel_threads set taken_over_by = (select id from members where id = ${undo.takenOverBy}),
                   taken_over_at = ${at(undo.takenOverAt)}, handed_back_at = ${at(undo.handedBackAt)},
                   assignee_id = (select id from members where id = ${undo.assigneeId})
                 where id = ${undo.threadId}`
      if (undo.handover !== null) {
        yield* sql`update handovers set picked_up_at = ${at(undo.handover.pickedUpAt)},
                     picked_up_by = ${undo.handover.pickedUpBy}, handed_back_at = ${at(undo.handover.handedBackAt)},
                     handed_back_by = ${undo.handover.handedBackBy}
                   where id = ${undo.handover.id}`
      }
      yield* audit(sql, "thread.holder_restored", undo.threadId)
      return
    }
    case "channel":
      return yield* restoreChannel(sql, undo)
  }
})
