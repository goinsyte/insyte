import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import {
  type Address,
  type Folder,
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
 */

const SELECT = `t.id, t.mailbox_id, t.subject, t.participants::text as participants, t.last_message_at,
  t.last_message_preview, t.unread, t.starred, t.labels, t.assignee_id, t.ticket_id, t.customer_id, t.has_attachments,
  t.has_inbound, t.archived_at, t.snoozed_until, t.spam_at, t.deleted_at`

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
    deletedAt: ms(r.deletedAt)
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
    : Effect.map(
      sql<Row>`select ${sql.literal(SELECT)} from email_threads t where t.id in ${sql.in([...ids])}
               order by t.last_message_at desc, t.id`,
      (rows) => rows.map(toRow)
    )

export const countsOf = Effect.fn("Threads.counts")(function*(sql: SqlClient.SqlClient, me: string) {
  const [c] = yield* sql<Omit<ThreadCounts, "byMailbox">>`
    select
      count(*) filter (where ${sql.literal(INBOX)})::int as all,
      count(*) filter (where ${sql.literal(INBOX)} and t.assignee_id is null)::int as unassigned,
      count(*) filter (where ${sql.literal(INBOX)} and t.assignee_id = ${me})::int as mine,
      count(*) filter (where ${sql.literal(INBOX)} and t.ticket_id is not null)::int as linked,
      count(*) filter (where t.archived_at is not null and t.spam_at is null and t.deleted_at is null)::int as archive,
      count(*) filter (where t.deleted_at is not null)::int as trash,
      count(*) filter (where t.spam_at is not null and t.deleted_at is null)::int as spam
    from email_threads t`
  const per = yield* sql<{ mailboxId: string; n: number }>`
    select t.mailbox_id, count(*)::int as n from email_threads t where ${sql.literal(INBOX)} group by t.mailbox_id`
  return { ...c!, byMailbox: Object.fromEntries(per.map((p) => [p.mailboxId, p.n])) } satisfies ThreadCounts
})

export const list = Effect.fn("Threads.list")(function*(input: typeof ListInput.Type) {
  yield* Policy.require("support", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const where = [sql.literal("true")]
      if (input.folder !== undefined) where.push(folderCondition(sql, input.folder, principal.id))
      if (input.mailboxId !== undefined) where.push(sql`t.mailbox_id = ${input.mailboxId}`)
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
                        or exists (select 1 from email_messages m where m.thread_id = t.id and m.body_text ilike ${like}))`)
      }
      const rows = yield* sql<Row>`
        select ${sql.literal(SELECT)} from email_threads t where ${sql.and(where)}
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

export const get = Effect.fn("Threads.get")(function*(id: string) {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [thread] = yield* rowsOf(sql, [id])
      if (thread === undefined) return yield* new NotFound({ entity: "thread", id })
      return new ThreadDetail({ thread, messages: yield* messagesOf(sql, id) })
    })
  )
})
