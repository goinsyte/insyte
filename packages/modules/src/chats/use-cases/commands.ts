import { Db } from "@insyte/database/Db"
import { Conflict, type Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  ChatsRestore,
  ConversationChange,
  type CreateChannelInput,
  type EditInput,
  EmptyMessage,
  MessageChange,
  type MuteInput,
  NameTaken,
  type PinInput,
  type PinMessageInput,
  type ReactInput,
  type SendInput
} from "../domain/Chats.ts"
import {
  audienceOf,
  type Conversation,
  conversationOf,
  conversationRow,
  joinIn,
  messageIn,
  messageRow,
  READERS
} from "./chats.ts"

/*
 * The chat writes (M11 step 4; widgets/04 §C). Sending, editing, reacting and pinning are a member's, at Klantenservice
 * · Bekijken; a new channel, and pinning a message in a channel, take Bewerken. Each change tells the conversation's
 * tabs to refetch it (`chat.posted`, ids only): a channel's whole room, a DM's two members. A teammate named with `@`
 * hears of it, unless they muted the conversation. Taking a message back and a new channel have an undo token
 * (`chats.restore`); the toggles have none, as the design has it.
 */

export const RESTORE = "chats.restore"

/** Tells the conversation's tabs, after the transaction commits. */
export const announce = Effect.fn("Chats.announce")(function*(
  sql: SqlClient.SqlClient,
  c: Conversation,
  messageId: string,
  updated: boolean
) {
  const p = yield* CurrentPrincipal
  const outboxId = yield* Outbox.write(sql, p.workspaceId, {
    type: "chat.posted",
    workspaceId: p.workspaceId,
    userId: p.userId ?? "system",
    conversationId: c.id,
    messageId,
    authorId: p.id,
    updated,
    to: yield* audienceOf(sql, c)
  })
  ;(yield* PendingEvents)?.add(outboxId)
})

/** The named teammates who are active in the team; anyone else is dropped. */
const namedOf = Effect.fn("Chats.namedOf")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return []
  const rows = yield* sql<{ id: string }>`
    select id from members where id in ${sql.in(wanted)} and deactivated_at is null and removed_at is null`
  const active = new Set(rows.map((r) => r.id))
  return wanted.filter((id) => active.has(id))
})

/** Posts one message on the command's transaction: in the stream, or under the message it answers. */
export const post = Effect.fn("Chats.post")(function*(
  sql: SqlClient.SqlClient,
  c: Conversation,
  input: {
    readonly body: string
    readonly mentions: ReadonlyArray<string>
    readonly records: ReadonlyArray<{ readonly kind: string; readonly id: string }>
    readonly replyTo: string | null
    readonly alsoInChannel: boolean
  }
) {
  const p = yield* CurrentPrincipal
  const id = mintId("msg")
  yield* sql`
    insert into messages (id, workspace_id, conversation_id, author_kind, author_id, body, mentions, records, reply_to,
                          also_in_channel)
    values (${id}, ${p.workspaceId}, ${c.id}, ${p.kind}, ${p.id}, ${input.body}, ${input.mentions}::text[],
            ${JSON.stringify(input.records.map((r) => ({ kind: r.kind, id: r.id })))}::jsonb, ${input.replyTo},
            ${input.alsoInChannel})`
  if (input.replyTo === null || input.alsoInChannel) {
    yield* sql`update conversations set last_message_at = now() where id = ${c.id}`
  }
  yield* joinIn(sql, c.id, true)
  yield* announce(sql, c, id, false)
  const told = input.mentions.filter((m) => m !== p.id)
  if (told.length > 0) {
    const outboxId = yield* Outbox.write(sql, p.workspaceId, {
      type: "chat.mentioned",
      workspaceId: p.workspaceId,
      userId: p.userId ?? "system",
      conversationId: c.id,
      messageId: id,
      memberIds: told,
      by: p.id
    })
    ;(yield* PendingEvents)?.add(outboxId)
  }
  return id
})

/** `Chats.send`: text, the teammates it names, the records it shares; in a thread with `replyTo`. */
export const send = Effect.fn("Chats.send")(function*(input: typeof SendInput.Type) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  const body = input.body.trim()
  const records = input.records ?? []
  if (body === "" && records.length === 0) return yield* new EmptyMessage()
  // Chargebacks have no table until M13: a card for one could not be drawn.
  if (records.some((r) => r.kind === "chargeback")) return yield* new Invalid({ fields: { records: "chargeback" } })
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const c = yield* conversationOf(sql, input.conversationId)
      let replyTo: string | null = null
      if (input.replyTo !== undefined) {
        const parent = yield* messageIn(sql, input.replyTo)
        if (parent.conversationId !== c.id) return yield* new NotFound({ entity: "message", id: input.replyTo })
        // A thread is one level deep: an answer to an answer joins the thread it is in.
        replyTo = parent.replyTo ?? parent.id
      }
      const id = yield* post(sql, c, {
        body,
        mentions: yield* namedOf(sql, input.mentions ?? []),
        records,
        replyTo,
        alsoInChannel: replyTo !== null && input.alsoToChannel === true
      })
      return new MessageChange({ message: yield* messageRow(sql, id), undo: null })
    })
  )
})

const ownMessage = Effect.fn("Chats.ownMessage")(function*(sql: SqlClient.SqlClient, messageId: string) {
  const p = yield* CurrentPrincipal
  const m = yield* messageIn(sql, messageId, { lock: true })
  // Only the author edits or takes back their own words (api.md §2.10).
  if (m.authorId !== p.id) return yield* new NotFound({ entity: "message", id: messageId })
  return m
})

/** `Chats.editMessage`: the author's own words, rewritten; "(bewerkt)" from then on. */
export const edit = Effect.fn("Chats.edit")(function*(input: typeof EditInput.Type) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  const body = input.body.trim()
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const m = yield* ownMessage(sql, input.messageId)
      if (m.deletedAt !== null) return yield* new NotFound({ entity: "message", id: input.messageId })
      const [shared] = yield* sql<{ records: number }>`
        select jsonb_array_length(records)::int as records from messages where id = ${m.id}`
      if (body === "" && (shared?.records ?? 0) === 0) return yield* new EmptyMessage()
      yield* sql`update messages set body = ${body}, edited_at = now() where id = ${m.id}`
      yield* announce(sql, m.conversation, m.id, true)
      return new MessageChange({ message: yield* messageRow(sql, m.id), undo: null })
    })
  )
})

/** `Chats.deleteMessage`: the author takes it back; Undo puts it back. */
export const remove = Effect.fn("Chats.remove")(function*(messageId: string) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const m = yield* ownMessage(sql, messageId)
      if (m.deletedAt !== null) return yield* new NotFound({ entity: "message", id: messageId })
      yield* sql`update messages set deleted_at = now() where id = ${m.id}`
      yield* announce(sql, m.conversation, m.id, true)
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "message_deleted", id: m.id } satisfies ChatsRestore
      })
      return new MessageChange({ message: yield* messageRow(sql, m.id), undo })
    })
  )
})

/** `Chats.react`: one emoji on or off, the person's own. */
export const react = Effect.fn("Chats.react")(function*(input: typeof ReactInput.Type) {
  yield* Policy.require("support", 1)
  const p = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const m = yield* messageIn(sql, input.messageId)
      if (m.deletedAt !== null) return yield* new NotFound({ entity: "message", id: m.id })
      if (input.on) {
        yield* sql`insert into message_reactions (workspace_id, message_id, principal_id, emoji)
                   values (${p.workspaceId}, ${m.id}, ${p.id}, ${input.emoji}) on conflict do nothing`
      } else {
        yield* sql`delete from message_reactions
                   where message_id = ${m.id} and principal_id = ${p.id} and emoji = ${input.emoji}`
      }
      yield* announce(sql, m.conversation, m.id, true)
      return new MessageChange({ message: yield* messageRow(sql, m.id), undo: null })
    })
  )
})

/** `Chats.pinMessage`: "Vastzetten in kanaal" / "Losmaken". In a channel it takes Bewerken; in a DM either of the two. */
export const pinMessage = Effect.fn("Chats.pinMessage")(function*(input: typeof PinMessageInput.Type) {
  yield* Policy.require("support", 1)
  const p = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const m = yield* messageIn(sql, input.messageId, { lock: true })
      if (m.conversation.kind !== "dm") yield* Policy.require("support", 2)
      if (m.deletedAt !== null) return yield* new NotFound({ entity: "message", id: m.id })
      yield* input.pinned
        ? sql`update messages set pinned_at = coalesce(pinned_at, now()), pinned_by = ${p.id} where id = ${m.id}`
        : sql`update messages set pinned_at = null, pinned_by = null where id = ${m.id}`
      yield* announce(sql, m.conversation, m.id, true)
      return new MessageChange({ message: yield* messageRow(sql, m.id), undo: null })
    })
  )
})

/** The person's own settings in a conversation: pinned to the top of Chats, or muted. */
const setOwn = (conversationId: string, field: "pinned" | "muted", on: boolean) =>
  Effect.gen(function*() {
    yield* Policy.require("support", 1)
    const p = yield* CurrentPrincipal
    const db = yield* Db
    return yield* db.scoped((sql) =>
      Effect.gen(function*() {
        yield* conversationOf(sql, conversationId)
        yield* joinIn(sql, conversationId, false)
        yield* sql`update conversation_members set ${sql.literal(field)} = ${on}
                   where conversation_id = ${conversationId} and principal_id = ${p.id}`
        return yield* conversationRow(sql, conversationId)
      })
    )
  })

export const pin = (input: typeof PinInput.Type) => setOwn(input.conversationId, "pinned", input.pinned)
export const mute = (input: typeof MuteInput.Type) => setOwn(input.conversationId, "muted", input.muted)

/** `Chats.markRead`: read up to now, so the unread count falls. */
export const markRead = Effect.fn("Chats.markRead")(function*(conversationId: string) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* conversationOf(sql, conversationId)
      yield* joinIn(sql, conversationId, true)
      return yield* conversationRow(sql, conversationId)
    })
  )
})

/**
 * `Chats.typing`: who should see "{wie} is bezig" — a DM's other member, or the room for a channel (`null`). Not
 * stored; the transport sends the frame.
 */
export const typing = Effect.fn("Chats.typing")(function*(conversationId: string) {
  yield* Policy.require("support", 1)
  const p = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const c = yield* conversationOf(sql, conversationId)
      const to = yield* audienceOf(sql, c)
      return { principalId: p.id, to: to === null ? null : to.filter((id) => id !== p.id) }
    })
  )
})

/** What "Nieuw kanaal" makes of a name: lower case, words joined by `-`, no `#` ("Wordt weergegeven als #slug"). */
export const slugOf = (raw: string) =>
  raw.trim().replace(/^#+/, "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)

const insertChannel = Effect.fn("Chats.insertChannel")(function*(
  sql: SqlClient.SqlClient,
  input: {
    readonly kind: "channel" | "supplier_channel"
    readonly name: string
    readonly topic: string
    readonly supplierId: string | null
  }
) {
  const p = yield* CurrentPrincipal
  const id = mintId("cnv")
  const made = yield* sql<{ id: string }>`
    insert into conversations (id, workspace_id, kind, name, topic, supplier_id, created_by)
    values (${id}, ${p.workspaceId}, ${input.kind}, ${input.name}, ${input.topic}, ${input.supplierId}, ${p.id})
    on conflict do nothing returning id`
  return made.length === 0 ? null : id
})

/** `Chats.createChannel`: a new channel for the whole team; Undo archives it again. */
export const createChannel = Effect.fn("Chats.createChannel")(function*(input: typeof CreateChannelInput.Type) {
  yield* Policy.require("support", 2)
  const p = yield* CurrentPrincipal
  const db = yield* Db
  const name = slugOf(input.name)
  if (name === "") return yield* new Invalid({ fields: { name: "required" } })
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const id = yield* insertChannel(sql, {
        kind: "channel",
        name,
        topic: (input.topic ?? "").trim(),
        supplierId: null
      })
      if (id === null) return yield* new NameTaken({ name })
      yield* joinIn(sql, id, true)
      yield* Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action: "conversation.created",
        subjectType: "conversation",
        subjectId: id,
        diff: { name }
      })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "channel_created", id } satisfies ChatsRestore
      })
      return new ConversationChange({ conversation: yield* conversationRow(sql, id), undo })
    })
  )
})

/** `Chats.openDm`: the DM with a teammate, made the first time ("Bericht"). */
export const openDm = Effect.fn("Chats.openDm")(function*(memberId: string) {
  yield* Policy.require("support", 1)
  const p = yield* CurrentPrincipal
  const db = yield* Db
  if (memberId === p.id) return yield* new Invalid({ fields: { memberId: "self" } })
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [other] = yield* sql<{ id: string }>`
        select m.id from (${sql.literal(READERS)}) m where m.id = ${memberId}`
      if (other === undefined) return yield* new NotFound({ entity: "member", id: memberId })
      const key = [p.id, memberId].toSorted().join(":")
      yield* sql`
        insert into conversations (id, workspace_id, kind, name, dm_key, created_by)
        values (${mintId("cnv")}, ${p.workspaceId}, 'dm', 'dm', ${key}, ${p.id})
        on conflict do nothing`
      const [c] = yield* sql<{ id: string }>`select id from conversations where dm_key = ${key}`
      for (const who of [p.id, memberId]) {
        yield* sql`insert into conversation_members (workspace_id, conversation_id, principal_kind, principal_id)
                   values (${p.workspaceId}, ${c!.id}, 'member', ${who}) on conflict do nothing`
      }
      return yield* conversationRow(sql, c!.id)
    })
  )
})

/**
 * `Chats.openSupplierChannel`: the shared channel with a supplier ("Bericht aan {leverancier}"), made the first time,
 * named after them. The supplier's own side joins it in M16.
 */
export const openSupplierChannel = Effect.fn("Chats.openSupplierChannel")(function*(supplierId: string) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [supplier] = yield* sql<{ id: string; name: string }>`
        select id, name from suppliers where id = ${supplierId} and deleted_at is null`
      if (supplier === undefined) return yield* new NotFound({ entity: "supplier", id: supplierId })
      const [had] = yield* sql<{ id: string }>`select id from conversations where supplier_id = ${supplierId}`
      if (had !== undefined) {
        yield* sql`update conversations set archived_at = null where id = ${had.id}`
        return yield* conversationRow(sql, had.id)
      }
      const base = slugOf(supplier.name) || "leverancier"
      const topic = `Gedeeld met ${supplier.name}`
      const id = (yield* insertChannel(sql, { kind: "supplier_channel", name: base, topic, supplierId }))
        ?? (yield* insertChannel(sql, { kind: "supplier_channel", name: `${base}-leverancier`, topic, supplierId }))
      if (id === null) return yield* new NameTaken({ name: base })
      return yield* conversationRow(sql, id)
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(ChatsRestore)

/**
 * `Shared.undo` for `chats.restore`: a message taken back is there again, a new channel archived, and a command that ran
 * has its own undo spent (`runInner`, composed where the app is) and its card marked undone.
 */
export const restore = Effect.fn("Chats.restore")(function*(
  sql: SqlClient.SqlClient,
  compensation: unknown,
  deps: {
    readonly runInner: (
      command: string,
      compensation: unknown
    ) => Effect.Effect<void, Forbidden | NotFound | Conflict | SqlError.SqlError, CurrentPrincipal>
  }
) {
  const p = yield* CurrentPrincipal
  const r = yield* decodeRestore(compensation).pipe(Effect.orDie)
  // Who can no longer open the conversation cannot take back what happened in it: as gone.
  const theirs = (id: string) =>
    conversationOf(sql, id).pipe(
      Effect.catchTag("NotAMember", () => Effect.fail(new Conflict({ entity: "conversation", reason: "gone" })))
    )
  switch (r.kind) {
    case "message_deleted": {
      const back = yield* sql<{ conversationId: string }>`
        update messages set deleted_at = null where id = ${r.id} and author_id = ${p.id} and deleted_at is not null
        returning conversation_id`
      if (back.length === 0) return yield* new Conflict({ entity: "message", reason: "gone" })
      yield* announce(sql, yield* theirs(back[0]!.conversationId), r.id, true)
      return
    }
    case "channel_created":
    case "channel_archived": {
      yield* sql`update conversations set archived_at = ${r.kind === "channel_created" ? new Date() : null}
                 where id = ${r.id}`
      yield* Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action: r.kind === "channel_created" ? "conversation.archived" : "conversation.restored",
        subjectType: "conversation",
        subjectId: r.id
      })
      return
    }
    case "action": {
      const inner = yield* Undo.redeemByHash(sql, r.innerHash)
      yield* deps.runInner(inner.command, inner.compensation)
      const [a] = yield* sql<{ messageId: string; conversationId: string }>`
        update chat_actions set state = 'undone', undo_until = null where id = ${r.id} and state = 'done'
        returning message_id, conversation_id`
      if (a === undefined) return yield* new Conflict({ entity: "chat_action", reason: "gone" })
      // What it made is gone again, so its card is too (a card's message shares nothing else).
      yield* sql`update messages set records = '[]'::jsonb where id = ${a.messageId}`
      yield* announce(sql, yield* theirs(a.conversationId), a.messageId, true)
      return
    }
  }
})
