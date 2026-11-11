import { Db } from "@insyte/database/Db"
import { type AreaId, canRole } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Array as Arr, Effect, Order } from "effect"
import type { SqlClient } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  ACTIVITY_LIMIT,
  type ActivityInput,
  type ActivityRow,
  type ActivitySource,
  type AgendaInput,
  type AgendaRow,
  HomeActivity,
  HomeAgenda,
  HomeWork,
  type WorkRow
} from "../domain/Lists.ts"

/*
 * Mijn werk, the agenda and the activity feed (M10.3b), from the live tables. Each source narrows to the areas and
 * stores the role may open; one it may not read adds nothing. Days are the workspace's (`workspaces.timezone`).
 */

/** Whether the role holds `area` at `level` or more. */
const holds = Effect.fn("Home.holds")(function*() {
  const { role } = yield* CurrentPrincipal
  const plain = { ...role, stores: role.stores === "all" ? ("all" as const) : [...role.stores] }
  return (area: AreaId, level: 1 | 2 | 3 = 1) => canRole(plain, area, level)
})

/** The queue's areas the role may open, and its stores, as conditions on `q`. */
const queueScope = Effect.fn("Home.queueScope")(function*(sql: SqlClient.SqlClient) {
  const can = yield* holds()
  const { role } = yield* CurrentPrincipal
  const areas = (["orders", "returns", "products", "settings"] as const).filter((a) => can(a))
  const stores = role.stores === "all"
    ? sql`true`
    : sql`(q.store_id is null or q.store_id = any(${[...role.stores]}))`
  return sql`q.area = any(${areas}) and ${stores}`
})

const timezoneOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ tz: string }>`select timezone as tz from workspaces where id = app_workspace_id()`,
    (rows) => rows[0]?.tz ?? "Europe/Amsterdam"
  )

const ms = (d: Date | null): number | null => (d === null ? null : d.getTime())

const NO_WORK = {
  number: null,
  count: null,
  signal: null,
  priority: null,
  dueAt: null,
  dueDay: null,
  doneAt: null
} as const satisfies Partial<WorkRow>

/* ── Mijn werk ─────────────────────────────────────────────────────────────────────────────────── */

export const work = Effect.fn("Home.work")(function*() {
  const principal = yield* CurrentPrincipal
  const can = yield* holds()
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const tz = yield* timezoneOf(sql)
      const today = sql`(date_trunc('day', now() at time zone ${tz}) at time zone ${tz})`
      const rows: Array<WorkRow> = []

      const todos = yield* sql<{ id: string; text: string; due: string | null; doneAt: Date | null }>`
        select id, text, due::text as due, done_at from todos
        where member_id = ${principal.id} and deleted_at is null and (done_at is null or done_at >= ${today})`
      for (const t of todos) {
        rows.push({
          ...NO_WORK,
          id: `todo:${t.id}`,
          kind: "todo",
          subjectId: t.id,
          title: t.text,
          dueDay: t.due,
          doneAt: ms(t.doneAt)
        })
      }

      const scope = yield* queueScope(sql)
      const queue = yield* sql<
        {
          id: string
          title: string
          signal: "red" | "amber"
          dueAt: Date | null
          state: string
          decidedAt: Date | null
        }
      >`
        select q.id, q.title, q.signal, q.due_at, q.state, q.decided_at from queue_items q
        where q.resolved_at is null and q.signal in ('red', 'amber') and ${scope}
          and (q.state = 'open' or (q.decided_by = ${principal.id} and q.decided_at >= ${today}))`
      for (const q of queue) {
        rows.push({
          ...NO_WORK,
          id: `queue:${q.id}`,
          kind: "queue",
          subjectId: q.id,
          title: q.title,
          signal: q.signal,
          dueAt: ms(q.dueAt),
          doneAt: q.state === "open" ? null : ms(q.decidedAt)
        })
      }

      if (can("support")) {
        const stores = yield* inScope(sql, "t.store_id")
        const tickets = yield* sql<{
          id: string
          number: string
          title: string
          priority: "low" | "medium" | "high"
          dueAt: Date | null
          status: string
          updatedAt: Date
        }>`
          select t.id, t.number::text as number, t.title, t.priority, t.due_at, t.status, t.updated_at from tickets t
          where t.archived_at is null and t.deleted_at is null and t.spam_at is null
            and (t.store_id is null or ${stores})
            and exists (select 1 from ticket_assignees a where a.ticket_id = t.id and a.member_id = ${principal.id})
            and (t.status <> 'done' or t.updated_at >= ${today})`
        for (const t of tickets) {
          rows.push({
            ...NO_WORK,
            id: `ticket:${t.id}`,
            kind: "ticket",
            subjectId: t.id,
            title: t.title,
            number: t.number,
            priority: t.priority,
            dueAt: ms(t.dueAt),
            doneAt: t.status === "done" ? t.updatedAt.getTime() : null
          })
        }
      }

      if (can("suppliers") && can("orders")) {
        const stores = yield* inScope(sql, "o.store_id")
        // Who to chase: a supplier holding open work on delayed orders, the most first.
        const suppliers = yield* sql<{ id: string; name: string; late: number; first: string; handoffBy: Date | null }>`
          select s.id, s.name, count(*)::int as late, min(o.number) as first, min(w.handoff_by) as handoff_by
          from supplier_work w join orders o on o.id = w.order_id join suppliers s on s.id = w.supplier_id
          where w.status in ('to_accept', 'to_ship', 'problem') and o.delayed_at is not null and ${stores}
          group by s.id, s.name order by late desc, s.name limit 4`
        for (const s of suppliers) {
          rows.push({
            ...NO_WORK,
            id: `supplier:${s.id}`,
            kind: "supplier",
            subjectId: s.id,
            title: s.name,
            number: s.first,
            count: s.late,
            dueAt: ms(s.handoffBy)
          })
        }
      }

      if (can("team")) {
        // The member's own open invitations; a manager follows up on every one.
        const anyone = can("team", 2)
        const invites = yield* sql<{ id: string; email: string; expiresAt: Date }>`
          select i.id, i.email, i.expires_at from invitations i
          where i.kind = 'team' and i.accepted_at is null and i.revoked_at is null
            and (${anyone} or i.invited_by = ${principal.id})`
        const now = Date.now()
        for (const i of invites) {
          const expires = i.expiresAt.getTime()
          rows.push({
            ...NO_WORK,
            id: `invite:${i.id}`,
            kind: "invite",
            subjectId: i.id,
            title: i.email,
            // Followed up the day before it lapses; a lapsed one is resent.
            dueAt: expires > now ? Math.max(now, expires - 86_400_000) : expires
          })
        }
      }
      return new HomeWork({ timezone: tz, rows })
    })
  )
})

/* ── Agenda ────────────────────────────────────────────────────────────────────────────────────── */

export const agenda = Effect.fn("Home.agenda")(function*(input: AgendaInput) {
  const principal = yield* CurrentPrincipal
  const can = yield* holds()
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const tz = yield* timezoneOf(sql)
      const days = input.span === "day" ? 1 : 7
      const [span] = yield* sql<{ start: Date; end: Date }>`
        select (${input.from}::date::timestamp at time zone ${tz}) as start,
               ((${input.from}::date + ${days})::timestamp at time zone ${tz}) as end`
      const { start, end } = span!
      const within = (column: string) => sql`${sql.literal(column)} >= ${start} and ${sql.literal(column)} < ${end}`
      const rows: Array<AgendaRow> = []
      const base = { detail: null, number: null, count: null, late: null, signal: null, allDay: false, past: false }

      const scope = yield* queueScope(sql)
      const queue = yield* sql<
        { id: string; title: string; signal: AgendaRow["signal"]; dueAt: Date; store: string | null }
      >`
        select q.id, q.title, q.signal, q.due_at, s.name as store from queue_items q
        left join stores s on s.id = q.store_id
        where q.resolved_at is null and q.state = 'open' and q.due_at is not null and ${
        within("q.due_at")
      } and ${scope}`
      for (const q of queue) {
        rows.push({
          ...base,
          id: `queue:${q.id}`,
          kind: "queue",
          subjectId: q.id,
          title: q.title,
          detail: q.store,
          signal: q.signal,
          at: q.dueAt.getTime()
        })
      }

      if (can("suppliers") && can("orders")) {
        const stores = yield* inScope(sql, "o.store_id")
        // A supplier's hand-offs to the carrier, per promised moment: how many orders, and which run late.
        const handoffs = yield* sql<
          { id: string; name: string; handoffBy: Date; count: number; late: number; numbers: string }
        >`
          select s.id, s.name, w.handoff_by, count(*)::int as count,
                 count(*) filter (where o.delayed_at is not null)::int as late,
                 array_to_string((array_agg(o.number order by o.number))[1:3], ', ') as numbers
          from supplier_work w join orders o on o.id = w.order_id join suppliers s on s.id = w.supplier_id
          where w.status in ('to_accept', 'to_ship', 'problem') and w.handoff_by is not null
            and ${within("w.handoff_by")} and ${stores}
          group by s.id, s.name, w.handoff_by`
        for (const h of handoffs) {
          rows.push({
            ...base,
            id: `supplier:${h.id}:${h.handoffBy.getTime()}`,
            kind: "supplier",
            subjectId: h.id,
            title: h.name,
            detail: h.numbers,
            count: h.count,
            late: h.late,
            signal: h.late > 0 ? "amber" : null,
            at: h.handoffBy.getTime()
          })
        }
      }

      if (can("support")) {
        const stores = yield* inScope(sql, "t.store_id")
        const tickets = yield* sql<{ id: string; number: string; title: string; dueAt: Date; priority: string }>`
          select t.id, t.number::text as number, t.title, t.due_at, t.priority from tickets t
          where t.status <> 'done' and t.archived_at is null and t.deleted_at is null and t.spam_at is null
            and t.due_at is not null and ${within("t.due_at")} and (t.store_id is null or ${stores})`
        for (const t of tickets) {
          rows.push({
            ...base,
            id: `ticket:${t.id}`,
            kind: "ticket",
            subjectId: t.id,
            title: t.title,
            number: t.number,
            signal: t.priority === "high" ? "red" : null,
            at: t.dueAt.getTime()
          })
        }
      }

      if (can("team")) {
        const invites = yield* sql<{ id: string; email: string; expiresAt: Date }>`
          select i.id, i.email, i.expires_at from invitations i
          where i.kind = 'team' and i.accepted_at is null and i.revoked_at is null and ${within("i.expires_at")}`
        const now = Date.now()
        for (const i of invites) {
          rows.push({
            ...base,
            id: `invite:${i.id}`,
            kind: "invite",
            subjectId: i.id,
            title: i.email,
            at: i.expiresAt.getTime(),
            past: i.expiresAt.getTime() < now
          })
        }
      }

      const todos = yield* sql<{ id: string; text: string; at: Date }>`
        select id, text, (due::timestamp at time zone ${tz}) as at from todos
        where member_id = ${principal.id} and deleted_at is null and done_at is null and due is not null
          and due >= ${input.from}::date and due < ${input.from}::date + ${days}`
      for (const t of todos) {
        rows.push({
          ...base,
          id: `todo:${t.id}`,
          kind: "todo",
          subjectId: t.id,
          title: t.text,
          at: t.at.getTime(),
          allDay: true
        })
      }

      return new HomeAgenda({
        from: input.from,
        span: input.span,
        timezone: tz,
        rows: Arr.sort(rows, Order.mapInput(Order.Number, (r: AgendaRow) => r.at))
      })
    })
  )
})

/* ── Activiteit ────────────────────────────────────────────────────────────────────────────────── */

/** How far back the feed and its facets read. */
const ACTIVITY_DAYS = 90

/** What each record type needs to be seen, and which source a teammate's change on it is. */
const SUBJECTS: Record<string, { readonly area: AreaId; readonly source: ActivitySource }> = {
  order: { area: "orders", source: "order" },
  customer: { area: "customers", source: "team" },
  product: { area: "products", source: "team" },
  quality_check: { area: "products", source: "supplier" },
  return: { area: "returns", source: "return" },
  ticket: { area: "support", source: "ticket" },
  supplier: { area: "suppliers", source: "supplier" },
  member: { area: "team", source: "team" },
  invitation: { area: "team", source: "team" },
  role: { area: "team", source: "team" },
  api_key: { area: "settings", source: "integration" },
  store: { area: "settings", source: "integration" }
}

/** Cosmetic or bookkeeping changes the feed leaves out. */
const QUIET = ["ticket.reordered", "ticket.put_back"]

interface FeedRow {
  readonly id: string
  readonly at: Date
  readonly source: ActivitySource
  readonly actorKind: string
  readonly actorKey: string
  readonly actorName: string | null
  readonly action: string
  readonly subjectType: string
  readonly subjectId: string
  readonly label: string | null
  readonly diff: unknown
  readonly amountMinor: string | null
  readonly currency: string | null
  readonly customer: string | null
}

const cursorOf = (r: { readonly at: Date; readonly id: string }) => `${r.at.getTime()}|${r.id}`

const parseCursor = (cursor: string | undefined) => {
  if (cursor === undefined) return null
  const [at, ...id] = cursor.split("|")
  const t = Number(at)
  return Number.isFinite(t) && id.length > 0 ? { at: new Date(t), id: id.join("|") } : null
}

export const activity = Effect.fn("Home.activity")(function*(input: ActivityInput) {
  const can = yield* holds()
  const { role } = yield* CurrentPrincipal
  const db = yield* Db
  const limit = input.limit ?? ACTIVITY_LIMIT
  const types = Object.entries(SUBJECTS).filter(([, s]) => can(s.area)).map(([t]) => t)
  const sourceCase = `case
    when f.actor_kind = 'shop' then 'order'
    when f.actor_kind = 'supplier_contact' then 'supplier'
    when f.actor_kind in ('api_key', 'service_account', 'system') then 'integration'
    when f.actor_kind in ('agent', 'insyte') then 'insyte'
    ${Object.entries(SUBJECTS).map(([t, s]) => `when f.subject_type = '${t}' then '${s.source}'`).join("\n    ")}
    else 'team' end`
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const stores = role.stores === "all"
        ? sql`true`
        : sql`(f.store_id is null or f.store_id = any(${[...role.stores]}))`
      // Every change the role may see, and every order the store placed, over the last 90 days, with its record named.
      const feed = sql`(
        select f.*, ${sql.literal(sourceCase)} as source,
               f.actor_kind || ':' || f.actor_id as actor_key
        from (
          select a.id, a.at, a.actor_kind, a.actor_id, a.action, a.subject_type, a.subject_id, a.diff,
                 null::bigint as amount_minor, null::text as currency, null::text as customer,
                 coalesce(o.number, r.number, '#' || t.number::text, p.title, qp.title, s.name, nullif(c.name, '')) as label,
                 coalesce(o.store_id, r.store_id, t.store_id, p.store_id, qp.store_id, c.store_id) as store_id,
                 coalesce(u.name, sa.name) as actor_name
          from audit_events a
          left join orders o on a.subject_type = 'order' and o.id = a.subject_id
          left join returns r on a.subject_type = 'return' and r.id = a.subject_id
          left join tickets t on a.subject_type = 'ticket' and t.id = a.subject_id
          left join products p on a.subject_type = 'product' and p.id = a.subject_id
          left join quality_checks q on a.subject_type = 'quality_check' and q.id = a.subject_id
          left join products qp on qp.id = q.product_id
          left join suppliers s on a.subject_type = 'supplier' and s.id = a.subject_id
          left join customers c on a.subject_type = 'customer' and c.id = a.subject_id
          left join members m on a.actor_kind = 'member' and m.id = a.actor_id
          left join auth."user" u on u.id = m.user_id
          left join suppliers sa on a.actor_kind = 'supplier_contact' and sa.id = a.actor_id
          where a.at > now() - make_interval(days => ${ACTIVITY_DAYS})
            and a.subject_type = any(${types}) and a.action <> all(${QUIET})
          union all
          select 'placed_' || o.id, o.placed_at, 'shop', o.store_id, 'order.placed', 'order', o.id, '{}'::jsonb,
                 o.total_minor, o.currency, nullif(o.customer_name, ''), o.number, o.store_id, st.name
          from orders o join stores st on st.id = o.store_id
          where ${can("orders")} and not o.is_draft and o.placed_at > now() - make_interval(days => ${ACTIVITY_DAYS})
        ) f
        where ${stores})`
      const who = input.who === undefined ? sql`true` : sql`x.actor_key = ${input.who}`
      const source = input.source === undefined ? sql`true` : sql`x.source = ${input.source}`
      const after = parseCursor(input.cursor)
      const page = yield* sql<FeedRow>`
        select x.id, x.at, x.source, x.actor_kind, x.actor_key, x.actor_name, x.action, x.subject_type, x.subject_id,
               x.label, x.diff, x.amount_minor::text, x.currency, x.customer
        from ${feed} x
        where ${who} and ${source} ${after === null ? sql`` : sql`and (x.at, x.id) < (${after.at}, ${after.id})`}
        order by x.at desc, x.id desc limit ${limit + 1}`
      const [total] = yield* sql<{ n: number }>`
        select count(*)::int as n from ${feed} x where ${who} and ${source}`
      const actors = yield* sql<{ key: string; name: string | null; count: number }>`
        select x.actor_key as key, max(x.actor_name) as name, count(*)::int as count
        from ${feed} x where ${source} group by x.actor_key order by count desc, key limit 30`
      const sources = yield* sql<{ source: ActivitySource; count: number }>`
        select x.source, count(*)::int as count from ${feed} x where ${who} group by x.source order by count desc`
      const rows = page.slice(0, limit)
      const last = rows[rows.length - 1]
      return new HomeActivity({
        rows: rows.map((r): ActivityRow => ({
          id: r.id,
          cursor: cursorOf(r),
          at: r.at.getTime(),
          source: r.source,
          actorKind: r.actorKind,
          actorKey: r.actorKey,
          actorName: r.actorName,
          action: r.action,
          subjectType: r.subjectType,
          subjectId: r.subjectId,
          label: r.label,
          diff: (r.diff ?? {}) as ActivityRow["diff"],
          amountMinor: r.amountMinor === null ? null : Number(r.amountMinor),
          currency: r.currency,
          customer: r.customer
        })),
        total: total?.n ?? 0,
        actors,
        sources,
        next: page.length > limit && last !== undefined ? cursorOf(last) : null
      })
    })
  )
})
