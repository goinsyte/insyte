import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import { likePattern, prefixPattern, SearchHit } from "../../shared/domain/Search.ts"
import { inScopeOrNone } from "../../shared/use-cases/StoreScope.ts"
import {
  type Address,
  type AgentState,
  type ChatDraft,
  type ChatEntry,
  type Folder,
  type HandoverView,
  type ListInput,
  type MessageView,
  type ThreadCounts,
  ThreadDetail,
  ThreadList,
  ThreadRow
} from "../domain/Inbox.ts"

/*
 * `Threads.list` and `Threads.get` (M11 step 2), at Klantenservice · Bekijken. A mailbox is the whole team's, so every
 * member who may open the inbox reads every thread. The folders are the design's (`inbox-screen.tsx` `inFolder`) with
 * the gaps closed (widgets/04 §B): the inbox is what is not archived, not spam, not in the Prullenbak and not snoozed
 * into the future; a snooze that has passed is simply back.
 *
 * The website chat's threads (M15 step 8) are in the same list (`inbox_threads_v`), each in its store: a member held to
 * some stores sees the chats of those only, and every mail (a mailbox is no store's). Every read and count is fenced.
 */

const SELECT = `t.id, t.mailbox_id, t.subject, t.participants::text as participants, t.last_message_at,
  t.last_message_preview, t.unread, t.starred, t.labels, t.assignee_id, t.ticket_id, t.customer_id, t.has_attachments,
  t.has_inbound, t.archived_at, t.snoozed_until, t.spam_at, t.deleted_at, t.channel, t.store_id, t.agent_state,
  t.taken_over_by, t.closed_at, t.order_number`

/** The inbox's one list over mail and chat. */
export const THREADS = "inbox_threads_v t"

/** The principal's stores, as a condition on a thread: mail is no store's, a chat is its store's. */
export const fenced = (sql: SqlClient.SqlClient) => inScopeOrNone(sql, "t.store_id")

export interface Row {
  readonly id: string
  readonly mailboxId: string
  readonly subject: string
  readonly participants: string
  readonly lastMessageAt: Date
  readonly lastMessagePreview: string
  readonly unread: boolean
  readonly starred: boolean
  readonly labels: ReadonlyArray<string>
  readonly assigneeId: string | null
  readonly ticketId: string | null
  readonly customerId: string | null
  readonly hasAttachments: boolean
  readonly hasInbound: boolean
  readonly archivedAt: Date | null
  readonly snoozedUntil: Date | null
  readonly spamAt: Date | null
  readonly deletedAt: Date | null
  readonly channel: "webchat" | null
  readonly storeId: string | null
  readonly agentState: AgentState | null
  readonly takenOverBy: string | null
  readonly closedAt: Date | null
  readonly orderNumber: string | null
}

const ms = (d: Date | null) => d?.getTime() ?? null

export const toRow = (r: Row) =>
  new ThreadRow({
    id: r.id,
    mailboxId: r.mailboxId,
    subject: r.subject,
    // Read as text: the SQL client camelCases the keys of a json value.
    participants: JSON.parse(r.participants) as Array<{ name: string; email: string; team: boolean }>,
    lastMessageAt: r.lastMessageAt.getTime(),
    preview: r.lastMessagePreview,
    unread: r.unread,
    starred: r.starred,
    labels: r.labels,
    assigneeId: r.assigneeId,
    ticketId: r.ticketId,
    customerId: r.customerId,
    hasAttachments: r.hasAttachments,
    hasInbound: r.hasInbound,
    archivedAt: ms(r.archivedAt),
    snoozedUntil: ms(r.snoozedUntil),
    spamAt: ms(r.spamAt),
    deletedAt: ms(r.deletedAt),
    channel: r.channel,
    storeId: r.storeId,
    agentState: r.agentState,
    takenOverBy: r.takenOverBy,
    closedAt: ms(r.closedAt),
    orderNumber: r.orderNumber
  })

/** In the inbox: not set aside, and not snoozed into the future. */
const INBOX = `t.archived_at is null and t.spam_at is null and t.deleted_at is null
  and (t.snoozed_until is null or t.snoozed_until <= now())`

const folderCondition = (sql: SqlClient.SqlClient, folder: Folder, me: string) => {
  switch (folder) {
    case "all":
      return sql.literal(INBOX)
    case "unassigned":
      return sql`${sql.literal(INBOX)} and t.assignee_id is null`
    case "mine":
      return sql`${sql.literal(INBOX)} and t.assignee_id = ${me}`
    case "linked":
      return sql`${sql.literal(INBOX)} and t.ticket_id is not null`
    case "archive":
      return sql.literal("t.archived_at is not null and t.spam_at is null and t.deleted_at is null")
    case "spam":
      return sql.literal("t.spam_at is not null and t.deleted_at is null")
    case "trash":
      return sql.literal("t.deleted_at is not null")
  }
}

export const rowsOf = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0
    ? Effect.succeed([] as Array<ThreadRow>)
    : Effect.flatMap(fenced(sql), (fence) =>
      Effect.map(
        sql<Row>`select ${sql.literal(SELECT)} from ${sql.literal(THREADS)}
                 where t.id in ${sql.in([...ids])} and ${fence}
                 order by t.last_message_at desc, t.id`,
        (rows) => rows.map(toRow)
      ))

export const countsOf = Effect.fn("Threads.counts")(function*(sql: SqlClient.SqlClient, me: string) {
  const fence = yield* fenced(sql)
  const [c] = yield* sql<Omit<ThreadCounts, "byMailbox" | "byChannel">>`
    select
      count(*) filter (where ${sql.literal(INBOX)})::int as all,
      count(*) filter (where ${sql.literal(INBOX)} and t.assignee_id is null)::int as unassigned,
      count(*) filter (where ${sql.literal(INBOX)} and t.assignee_id = ${me})::int as mine,
      count(*) filter (where ${sql.literal(INBOX)} and t.ticket_id is not null)::int as linked,
      count(*) filter (where t.archived_at is not null and t.spam_at is null and t.deleted_at is null)::int as archive,
      count(*) filter (where t.deleted_at is not null)::int as trash,
      count(*) filter (where t.spam_at is not null and t.deleted_at is null)::int as spam,
      count(*) filter (where ${sql.literal(INBOX)} and t.agent_state = 'handed_over')::int as handed_over,
      count(*) filter (where ${sql.literal(INBOX)} and t.agent_state = 'handled')::int as insyte
    from ${sql.literal(THREADS)} where ${fence}`
  const per = yield* sql<{ mailboxId: string; channel: string | null; n: number }>`
    select t.mailbox_id, t.channel, count(*)::int as n from ${sql.literal(THREADS)}
    where ${sql.literal(INBOX)} and ${fence} group by t.mailbox_id, t.channel`
  const byChannel: Record<string, number> = {}
  for (const p of per) if (p.channel !== null) byChannel[p.channel] = (byChannel[p.channel] ?? 0) + p.n
  return {
    ...c!,
    byMailbox: Object.fromEntries(per.filter((p) => p.channel === null).map((p) => [p.mailboxId, p.n])),
    byChannel
  } satisfies ThreadCounts
})

export const list = Effect.fn("Threads.list")(function*(input: typeof ListInput.Type) {
  yield* Policy.require("support", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const where: Array<Statement.Fragment> = [yield* fenced(sql)]
      if (input.folder !== undefined) where.push(folderCondition(sql, input.folder, principal.id))
      if (input.mailboxId !== undefined) where.push(sql`t.mailbox_id = ${input.mailboxId}`)
      if (input.channel !== undefined) {
        where.push(input.channel === "email" ? sql`t.channel is null` : sql`t.channel = ${input.channel}`)
      }
      if (input.view !== undefined) {
        where.push(sql`t.agent_state = ${input.view === "insyte" ? "handled" : "handed_over"}`)
      }
      for (const f of input.filters ?? []) {
        where.push(sql.literal(
          f === "unread"
            ? "t.unread"
            : f === "starred"
            ? "t.starred"
            : f === "attachments"
            ? "t.has_attachments"
            : "t.has_inbound"
        ))
      }
      const q = input.q?.trim() ?? ""
      if (q !== "") {
        const like = `%${q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
        where.push(sql`(t.subject ilike ${like} or t.participants::text ilike ${like}
                        or exists (select 1 from email_messages m where m.thread_id = t.id and m.body_text ilike ${like})
                        or exists (select 1 from channel_messages m where m.thread_id = t.id and m.body ilike ${like}))`)
      }
      const rows = yield* sql<Row>`
        select ${sql.literal(SELECT)} from ${sql.literal(THREADS)} where ${sql.and(where)}
        order by t.last_message_at desc, t.id limit ${input.limit ?? 200}`
      return new ThreadList({ rows: rows.map(toRow), counts: yield* countsOf(sql, principal.id) })
    })
  )
})

/** The area panel's counts, for the frame. */
export const counts = Effect.fn("Threads.panelCounts")(function*() {
  yield* Policy.require("support", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) => countsOf(sql, principal.id))
})

interface MessageRow {
  readonly id: string
  readonly direction: MessageView["direction"]
  readonly kind: MessageView["kind"]
  readonly fromName: string
  readonly fromAddress: string
  readonly to: string
  readonly cc: string
  readonly subject: string
  readonly bodyText: string
  readonly bodyHtmlKey: string | null
  readonly sentAt: Date
  readonly sentBy: string | null
  readonly sendState: MessageView["sendState"]
  readonly sendError: string | null
  readonly attachments: string
}

export const messagesOf = (sql: SqlClient.SqlClient, threadId: string) =>
  Effect.map(
    sql<MessageRow>`
      select m.id, m.direction, m.kind, m.from_name, m.from_address, m."to"::text as to, m.cc::text as cc, m.subject,
             m.body_text, m.body_html_key, m.sent_at, m.sent_by, m.send_state, m.send_error,
             coalesce((select json_agg(json_build_object('id', a.id, 'name', f.name, 'mime', f.mime,
                                                         'size', f.size_bytes) order by a.position)
                       from attachments a join files f on f.id = a.file_id
                       where a.message_id = m.id and not a.inline), '[]')::text as attachments
      from email_messages m where m.thread_id = ${threadId} order by m.sent_at, m.created_at, m.id`,
    (rows) =>
      rows.map((m): MessageView => ({
        id: m.id,
        direction: m.direction,
        kind: m.kind,
        from: { name: m.fromName, email: m.fromAddress },
        to: JSON.parse(m.to) as Array<Address>,
        cc: JSON.parse(m.cc) as Array<Address>,
        subject: m.subject,
        bodyText: m.bodyText,
        hasHtml: m.bodyHtmlKey !== null,
        sentAt: m.sentAt.getTime(),
        sentBy: m.sentBy,
        sendState: m.sendState,
        sendError: m.sendError,
        attachments: (JSON.parse(m.attachments) as Array<{ id: string; name: string; mime: string; size: number }>)
          .map((a) => ({ ...a, size: Number(a.size) }))
      }))
  )

/** A chat's messages, oldest first, each with whether it still waits out its undo window. */
export const chatOf = (sql: SqlClient.SqlClient, threadId: string) =>
  Effect.map(
    sql<
      { id: string; author: ChatEntry["author"]; body: string; createdAt: Date; sentBy: string | null; due: boolean }
    >`
      select id, author, body, created_at, sent_by, visible_at > now() as due from channel_messages
      where thread_id = ${threadId} order by created_at, id`,
    (rows) =>
      rows.map((m): ChatEntry => ({
        id: m.id,
        author: m.author,
        text: m.body,
        at: m.createdAt.getTime(),
        sentBy: m.sentBy,
        sendState: m.due ? "scheduled" : "sent"
      }))
  )

/**
 * The customer agent's open draft on a chat: the newest, neither used nor thrown away, and newer than anything the
 * team or the agent wrote there (a reply since answered it, or a person did). A closed chat has none.
 */
export const chatDraftOf = (sql: SqlClient.SqlClient, threadId: string) =>
  Effect.map(
    sql<{ id: string; text: string; createdAt: Date }>`
      select d.id, d.text, d.created_at from drafts d
      join channel_threads t on t.id = d.subject_id
      where d.subject_type = 'chat' and d.subject_id = ${threadId} and d.kind = 'reply'
        and d.used_at is null and d.discarded_at is null and t.closed_at is null and t.deleted_at is null
        and d.created_at > coalesce((select max(m.created_at) from channel_messages m
                                     where m.thread_id = t.id and m.author <> 'shopper'), '-infinity')
      order by d.created_at desc, d.id desc limit 1`,
    ([d]): ChatDraft | null => d === undefined ? null : { id: d.id, text: d.text, at: d.createdAt.getTime() }
  )

/** A chat's open handover, or else its last one. */
export const handoverOf = (sql: SqlClient.SqlClient, threadId: string) =>
  Effect.map(
    sql<
      {
        reason: string
        at: Date
        pickedUpAt: Date | null
        pickedUpBy: string | null
        handedBackAt: Date | null
      }
    >`select reason, at, picked_up_at, picked_up_by, handed_back_at from handovers where thread_id = ${threadId}
      order by handed_back_at is null desc, at desc limit 1`,
    ([h]): HandoverView | null =>
      h === undefined ? null : {
        reason: h.reason,
        at: h.at.getTime(),
        pickedUpAt: ms(h.pickedUpAt),
        pickedUpBy: h.pickedUpBy,
        handedBackAt: ms(h.handedBackAt)
      }
  )

export const get = Effect.fn("Threads.get")(function*(id: string) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [thread] = yield* rowsOf(sql, [id])
      if (thread === undefined) return yield* new NotFound({ entity: "thread", id })
      if (thread.channel !== null) {
        return new ThreadDetail({
          thread,
          messages: [],
          chat: yield* chatOf(sql, id),
          handover: yield* handoverOf(sql, id),
          draft: yield* chatDraftOf(sql, id)
        })
      }
      return new ThreadDetail({ thread, messages: yield* messagesOf(sql, id), chat: [], handover: null, draft: null })
    })
  )
})

/**
 * Up to `limit` threads for `Search.records`: a subject that starts with the text first, then one that holds it, then a
 * correspondent's name or address, then a message's text; newest first within each. Every mailbox is the team's, so
 * anyone at Klantenservice · Bekijken finds every thread; the Prullenbak and spam stay out. The hit names the subject
 * and who wrote in, and opens the thread in the inbox (`?thread=`, as the design's route reads it).
 */
export const search = Effect.fn("Threads.search")(function*(q: string, limit: number) {
  const allowed = yield* Policy.require("support", 1).pipe(
    Effect.as(true),
    Effect.catchTag("Forbidden", () => Effect.succeed(false))
  )
  const text = q.trim()
  if (!allowed || text === "") return [] as Array<SearchHit>
  const db = yield* Db
  const pattern = likePattern(text)
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const party = sql`exists (select 1 from jsonb_array_elements(t.participants) p
                               where p ->> 'name' ilike ${pattern} or p ->> 'email' ilike ${pattern})`
      const fence = yield* fenced(sql)
      const rows = yield* sql<{ id: string; subject: string; participants: string }>`
        select t.id, t.subject, t.participants::text as participants from ${sql.literal(THREADS)}
        where t.deleted_at is null and t.spam_at is null and ${fence}
          and (t.subject ilike ${pattern} or ${party}
               or exists (select 1 from email_messages m where m.thread_id = t.id and m.body_text ilike ${pattern})
               or exists (select 1 from channel_messages m where m.thread_id = t.id and m.body ilike ${pattern}))
        order by case when t.subject ilike ${prefixPattern(text)} then 0 when t.subject ilike ${pattern} then 1
                      when ${party} then 2 else 3 end,
                 t.last_message_at desc, t.id
        limit ${limit}`
      return rows.map((r) => {
        // Read as text: the SQL client camelCases the keys of a json value.
        const people = JSON.parse(r.participants) as Array<{ name?: string; email?: string; team?: boolean }>
        const other = people.find((p) => p.team !== true) ?? people[0]
        return new SearchHit({
          kind: "thread",
          id: r.id,
          title: r.subject.trim() || "(geen onderwerp)",
          subtitle: other === undefined ? null : (other.name?.trim() || other.email || null),
          href: `/inbox?thread=${r.id}`
        })
      })
    })
  )
})
