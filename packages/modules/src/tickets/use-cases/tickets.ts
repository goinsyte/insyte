import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { DEFAULT_LABELS, SYSTEM_TEMPLATES } from "../domain/Rules.ts"
import {
  type ListInput,
  type TicketComment,
  type TicketCounts,
  TicketDetail,
  TicketList,
  TicketOptions,
  TicketRow,
  type TicketView
} from "../domain/Tickets.ts"

/*
 * `Tickets.list`, `Tickets.get` and `Tickets.options` (M11 step 3), at Klantenservice · Bekijken. A ticket without a
 * store (one written by hand) is the whole team's; one about an order or a customer is in that record's store, so a
 * role fenced to stores reads only its own. The views are the design's (`lib/ticket-source.ts` `inView`), in SQL.
 */

const SELECT = `t.id, t.number, t.title, t.description, t.status, t.priority, t.source, t.position, t.template, t.topic,
  t.due_at, t.resolved_at, t.snoozed_until, t.archived_at, t.deleted_at, t.spam_at, t.store_id, t.created_at,
  t.updated_at, t.order_id, o.number as order_number, t.customer_id, c.name as customer_name,
  coalesce((select array_agg(l.label order by l.position, l.label) from ticket_labels l where l.ticket_id = t.id),
           '{}') as labels,
  coalesce((select json_agg(json_build_object('id', a.member_id, 'name', coalesce(u.name, '')) order by a.assigned_at,
                            a.member_id)
            from ticket_assignees a join members m on m.id = a.member_id left join auth."user" u on u.id = m.user_id
            where a.ticket_id = t.id), '[]')::text as assignees,
  (select count(*)::int from ticket_comments k
   where k.ticket_id = t.id and k.kind = 'comment' and k.deleted_at is null) as comment_count`

const FROM = `tickets t left join orders o on o.id = t.order_id left join customers c on c.id = t.customer_id`

interface Row {
  readonly id: string
  readonly number: string
  readonly title: string
  readonly description: string
  readonly status: TicketRow["status"]
  readonly priority: TicketRow["priority"]
  readonly source: TicketRow["source"]
  readonly position: number
  readonly template: string | null
  readonly topic: TicketRow["topic"]
  readonly dueAt: Date | null
  readonly resolvedAt: Date | null
  readonly snoozedUntil: Date | null
  readonly archivedAt: Date | null
  readonly deletedAt: Date | null
  readonly spamAt: Date | null
  readonly storeId: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly orderId: string | null
  readonly orderNumber: string | null
  readonly customerId: string | null
  readonly customerName: string | null
  readonly labels: ReadonlyArray<string>
  readonly assignees: string
  readonly commentCount: number
}

const ms = (d: Date | null) => d?.getTime() ?? null

const toRow = (r: Row) =>
  new TicketRow({
    id: r.id,
    number: Number(r.number),
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    source: r.source,
    position: Number(r.position),
    labels: r.labels,
    // Read as text: the SQL client camelCases the keys of a json value.
    assignees: JSON.parse(r.assignees) as Array<{ id: string; name: string }>,
    related: r.orderId !== null
      ? { type: "order", id: r.orderId, label: r.orderNumber ?? "" }
      : r.customerId !== null
      ? { type: "customer", id: r.customerId, label: r.customerName || "Klant" }
      : null,
    template: r.template,
    topic: r.topic,
    dueAt: ms(r.dueAt),
    resolvedAt: ms(r.resolvedAt),
    snoozedUntil: ms(r.snoozedUntil),
    archivedAt: ms(r.archivedAt),
    deletedAt: ms(r.deletedAt),
    spamAt: ms(r.spamAt),
    commentCount: r.commentCount,
    storeId: r.storeId,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime()
  })

/** The role's stores, as a condition on a ticket: one without a store is everyone's. */
export const ticketScope = Effect.fn("Tickets.scope")(function*(sql: SqlClient.SqlClient) {
  const scope = yield* inScope(sql, "t.store_id")
  return sql`(t.store_id is null or ${scope})`
})

/** A view as a condition on `t`, as `inView` decides it: the set-aside fields first, in the design's order. */
const viewCondition = (sql: SqlClient.SqlClient, view: TicketView, me: string) => {
  const snoozed = sql`(t.snoozed_until is not null and t.snoozed_until > now())`
  const kept = sql`t.deleted_at is null and t.spam_at is null and t.archived_at is null`
  switch (view) {
    case "trash":
      return sql`t.deleted_at is not null`
    case "spam":
      return sql`t.deleted_at is null and t.spam_at is not null`
    case "archived":
      return sql`t.deleted_at is null and t.spam_at is null and t.archived_at is not null`
    case "snoozed":
      return sql`${kept} and ${snoozed}`
    case "done":
      return sql`${kept} and t.status = 'done'`
    case "all":
      return sql`${kept} and not ${snoozed}`
    case "open":
      return sql`${kept} and not ${snoozed} and t.status <> 'done'`
    case "mine":
      return sql`${kept} and not ${snoozed} and t.status <> 'done'
                 and exists (select 1 from ticket_assignees a where a.ticket_id = t.id and a.member_id = ${me})`
    case "unassigned":
      return sql`${kept} and not ${snoozed} and t.status <> 'done'
                 and not exists (select 1 from ticket_assignees a where a.ticket_id = t.id)`
  }
}

/** The tickets, in the board's order. */
export const rowsOf = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0
    ? Effect.succeed([] as Array<TicketRow>)
    : Effect.map(
      sql<Row>`select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
               where t.id in ${sql.in([...ids])} order by t.position, t.created_at desc`,
      (rows) => rows.map(toRow)
    )

export const countsOf = Effect.fn("Tickets.counts")(function*(sql: SqlClient.SqlClient) {
  const principal = yield* CurrentPrincipal
  const scope = yield* ticketScope(sql)
  const of = (view: TicketView) => viewCondition(sql, view, principal.id)
  const [row] = yield* sql<Omit<TicketCounts, "bySource">>`
    select count(*) filter (where ${of("all")})::int as "all", count(*) filter (where ${of("open")})::int as open,
           count(*) filter (where ${of("mine")})::int as mine,
           count(*) filter (where ${of("unassigned")})::int as unassigned,
           count(*) filter (where ${of("snoozed")})::int as snoozed, count(*) filter (where ${of("done")})::int as done,
           count(*) filter (where ${of("archived")})::int as archived,
           count(*) filter (where ${of("trash")})::int as trash, count(*) filter (where ${of("spam")})::int as spam
    from tickets t where ${scope}`
  const bySource = yield* sql<{ source: string; n: number }>`
    select t.source, count(*)::int as n from tickets t where ${scope} and ${of("open")} group by t.source`
  return {
    all: row?.all ?? 0,
    open: row?.open ?? 0,
    mine: row?.mine ?? 0,
    unassigned: row?.unassigned ?? 0,
    snoozed: row?.snoozed ?? 0,
    done: row?.done ?? 0,
    archived: row?.archived ?? 0,
    trash: row?.trash ?? 0,
    spam: row?.spam ?? 0,
    bySource: Object.fromEntries(bySource.map((s) => [s.source, s.n]))
  } satisfies TicketCounts
})

export const list = Effect.fn("Tickets.list")(function*(input: typeof ListInput.Type) {
  yield* Policy.require("support", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* ticketScope(sql)
      const rows = yield* sql<Row>`
        select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
        where ${scope}
          and ${input.view === undefined ? sql`true` : viewCondition(sql, input.view, principal.id)}
          and ${input.source === undefined ? sql`true` : sql`t.source = ${input.source}`}
        order by t.position, t.created_at desc
        limit ${input.limit ?? 500}`
      return new TicketList({ rows: rows.map(toRow), counts: yield* countsOf(sql) })
    })
  )
})

/** The panel's counts alone, for the frame (ADR-0028). */
export const counts = Effect.fn("Tickets.panelCounts")(function*() {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => countsOf(sql))
})

export const get = Effect.fn("Tickets.get")(function*(id: string) {
  yield* Policy.require("support", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* ticketScope(sql)
      const [row] = yield* sql<Row>`select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
                                    where t.id = ${id} and ${scope}`
      if (row === undefined) return yield* new NotFound({ entity: "ticket", id })
      const comments = yield* commentsOf(sql, id)
      const [watching] = yield* sql`
        select 1 from ticket_watchers where ticket_id = ${id} and member_id = ${principal.id}`
      return new TicketDetail({ ticket: toRow(row), comments, watching: watching !== undefined })
    })
  )
})

interface CommentRow {
  readonly id: string
  readonly kind: TicketComment["kind"]
  readonly authorKind: string
  readonly authorId: string
  readonly authorName: string | null
  readonly body: string
  readonly mentions: ReadonlyArray<string>
  readonly createdAt: Date
  readonly editedAt: Date | null
}

/** A ticket's activity, newest first, with who wrote it and whom it names. */
export const commentsOf = (sql: SqlClient.SqlClient, ticketId: string, only?: string) =>
  Effect.gen(function*() {
    const rows = yield* sql<CommentRow>`
      select k.id, k.kind, k.author_kind, k.author_id, coalesce(u.name, ak.label) as author_name, k.body, k.mentions,
             k.created_at, k.edited_at
      from ticket_comments k
      left join members m on k.author_kind = 'member' and m.id = k.author_id
      left join auth."user" u on u.id = m.user_id
      left join api_keys ak on k.author_kind in ('api_key', 'agent') and ak.id = k.author_id
      where k.ticket_id = ${ticketId} and k.deleted_at is null
        and ${only === undefined ? sql`true` : sql`k.id = ${only}`}
      order by k.created_at desc, k.id desc limit 200`
    const named = [...new Set(rows.flatMap((r) => r.mentions))]
    const people = named.length === 0 ? [] : yield* sql<{ id: string; name: string }>`
      select m.id, coalesce(u.name, '') as name from members m left join auth."user" u on u.id = m.user_id
      where m.id in ${sql.in(named)}`
    const nameOf = new Map(people.map((p) => [p.id, p.name]))
    return rows.map((r): TicketComment => ({
      id: r.id,
      kind: r.kind,
      author: { kind: r.authorKind, id: r.authorId, name: r.authorName ?? "Insyte" },
      body: r.body,
      mentions: r.mentions.filter((m) => nameOf.has(m)).map((m) => ({ id: m, name: nameOf.get(m) ?? "" })),
      createdAt: r.createdAt.getTime(),
      editedAt: ms(r.editedAt)
    }))
  })

/** The labels the menus offer (the design's nine, then the team's own in use) and the templates. */
export const options = Effect.fn("Tickets.options")(function*() {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const used = yield* sql<{ label: string }>`
        select label from ticket_labels group by label order by count(*) desc, label limit 100`
      const own = yield* sql<{
        id: string
        label: string
        title: string
        description: string
        priority: TicketRow["priority"]
        labels: ReadonlyArray<string>
      }>`select id, label, title, description, priority, labels from ticket_templates
         where deleted_at is null order by position, created_at`
      return new TicketOptions({
        labels: [...new Set([...DEFAULT_LABELS, ...used.map((u) => u.label)])],
        templates: [...SYSTEM_TEMPLATES, ...own]
      })
    })
  )
})

/** A ticket's `#n`, where it exists and the caller's stores reach it (the inbox's "Aan ticket koppelen"). */
export const numberOf = Effect.fn("Tickets.numberOf")(function*(sql: SqlClient.SqlClient, ticketId: string) {
  const scope = yield* ticketScope(sql)
  const [row] = yield* sql<{ number: string }>`select t.number from tickets t where t.id = ${ticketId} and ${scope}`
  return row === undefined ? undefined : Number(row.number)
})
