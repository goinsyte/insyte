import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { FactsRange, type RangeInput } from "../domain/Facts.ts"

/*
 * The daily facts (M10.4), kept from the rows. Triggers mark which store-days a write touched (`fact_dirty_days`,
 * migration 0047); `drain` takes a batch of marks and recomputes each of those days whole, in every fact table, from
 * the rows as they are now (disputes too, migration 0078), then drops the marks. Recomputing rather than adding makes a replayed or reordered event
 * harmless, and makes the incremental path and a full rebuild the same query. The relay's `facts` sink drains a batch
 * after every order-ish change; the 15-minute sweep drains what is left, and once a night marks every store's last
 * three days first. Everything here runs in a transaction already scoped to one workspace.
 */

/** Days recomputed per transaction: a month, so a store's first import of years drains in short transactions. */
export const BATCH_DAYS = 31

interface Mark {
  readonly storeId: string
  readonly day: string
}

/** The store-days to recompute, with each store's timezone (the workspace's where the store has none). */
const PAIRS = `
  pairs as (
    select p.store_id, p.day, coalesce(s.timezone, w.timezone) as tz,
           (p.day::timestamp at time zone coalesce(s.timezone, w.timezone)) as starts,
           ((p.day + 1)::timestamp at time zone coalesce(s.timezone, w.timezone)) as ends
    from jsonb_to_recordset($1::jsonb) as p(store_id text, day date)
    join stores s on s.id = p.store_id join workspaces w on w.id = s.workspace_id
  )`

/**
 * The lines of the orders in `subjects` (a CTE with `id`), each with its order's share weight: the line's amount over
 * the order's, or all of it on the first line where the lines are free or missing (an order without lines gets one
 * null line). `rank` 1 is the first line, which carries the order's counts and the remainder of its money.
 */
const SHARES = `
  lines as (
    select ol.order_id, ol.product_id, ps.supplier_id, ol.quantity,
           ol.quantity::numeric * ol.unit_price_minor as amount,
           row_number() over (partition by ol.order_id order by ol.id) as rank,
           sum(ol.quantity::numeric * ol.unit_price_minor) over (partition by ol.order_id) as order_amount
    from order_lines ol
    left join product_supply ps on ps.product_id = ol.product_id and ps.is_primary
    where ol.order_id in (select id from subjects)
  ),
  shares as (
    select o.id as order_id, coalesce(l.rank, 1) as rank, l.product_id, l.supplier_id,
           coalesce(l.quantity, 0) as quantity,
           case when coalesce(l.order_amount, 0) > 0 then l.amount / l.order_amount
                when coalesce(l.rank, 1) = 1 then 1 else 0 end as weight
    from subjects o left join lines l on l.order_id = o.id
  )`

/** `value` shared over an order's lines by weight: whole minor units, the remainder on the first line. */
const share = (value: string) =>
  `(floor(${value} * s.weight)::bigint + case when s.rank = 1
     then ${value} - sum(floor(${value} * s.weight)::bigint) over (partition by s.order_id) else 0 end)`

/** Recomputes these store-days in every store-day fact table, from the rows. */
export const rebuild = Effect.fn("Facts.rebuild")(function*(sql: SqlClient.SqlClient, marks: ReadonlyArray<Mark>) {
  if (marks.length === 0) return
  const json = [JSON.stringify(marks.map((m) => ({ store_id: m.storeId, day: m.day })))]

  yield* sql.unsafe(
    `
    with ${PAIRS}
    delete from fact_orders_day f using pairs p where f.store_id = p.store_id and f.day = p.day`,
    json
  )
  yield* sql.unsafe(
    `
    with ${PAIRS},
    subjects as (
      select o.id, o.workspace_id, o.store_id, p.day, o.currency, o.total_minor, o.status, o.paid_at, o.channel,
             o.shipping_address ->> 'country' as country,
             o.status not in ('cancelled', 'refunded') and o.payment_status in ('paid', 'partially_refunded')
               as counted,
             coalesce(r.refunded, 0) as refunded, r.refunded is not null as has_refund
      from pairs p
      join orders o on o.store_id = p.store_id and o.placed_at >= p.starts and o.placed_at < p.ends
      left join lateral (
        select sum(amount_minor) as refunded from refunds where order_id = o.id and status = 'succeeded'
      ) r on true
      where not o.is_draft
    ),
    ${SHARES},
    rows as (
      select o.workspace_id, o.store_id, o.day, nullif(o.country, '') as country, s.product_id, s.supplier_id,
             nullif(o.channel, '') as channel, o.currency,
             (s.rank = 1)::int as orders,
             (s.rank = 1 and o.paid_at is not null)::int as paid_orders,
             (s.rank = 1 and o.counted)::int as counted_orders,
             case when o.counted then ${share("o.total_minor")} else 0 end as counted_revenue_minor,
             case when o.counted then s.quantity else 0 end as units,
             case when o.paid_at is not null then ${share("o.total_minor")} else 0 end as revenue_minor,
             (s.rank = 1 and o.has_refund)::int as refunds,
             ${share("o.refunded")} as refunded_minor,
             (s.rank = 1 and o.status = 'cancelled')::int as cancelled
      from subjects o join shares s on s.order_id = o.id
    )
    insert into fact_orders_day (workspace_id, store_id, day, country, product_id, supplier_id, channel, currency,
                                 orders, paid_orders, counted_orders, counted_revenue_minor, units, revenue_minor,
                                 refunds, refunded_minor, cancelled)
    select workspace_id, store_id, day, country, product_id, supplier_id, channel, currency,
           sum(orders), sum(paid_orders), sum(counted_orders), sum(counted_revenue_minor), sum(units),
           sum(revenue_minor), sum(refunds), sum(refunded_minor), sum(cancelled)
    from rows
    group by workspace_id, store_id, day, country, product_id, supplier_id, channel, currency`,
    json
  )

  yield* sql.unsafe(
    `
    with ${PAIRS}
    delete from fact_refunds_day f using pairs p where f.store_id = p.store_id and f.day = p.day`,
    json
  )
  yield* sql.unsafe(
    `
    with ${PAIRS},
    refunded as (
      select r.id, r.order_id, r.workspace_id, r.store_id, p.day, r.amount_minor, r.currency,
             nullif(r.reason, '') as reason
      from pairs p
      join refunds r on r.store_id = p.store_id and r.created_at >= p.starts and r.created_at < p.ends
      where r.status = 'succeeded'
    ),
    subjects as (select distinct order_id as id from refunded),
    ${SHARES},
    rows as (
      select r.workspace_id, r.store_id, r.day, r.reason, s.product_id, s.supplier_id, r.currency,
             (s.rank = 1)::int as refunds,
             (floor(r.amount_minor * s.weight)::bigint + case when s.rank = 1
               then r.amount_minor - sum(floor(r.amount_minor * s.weight)::bigint) over (partition by r.id)
               else 0 end) as amount_minor
      from refunded r join shares s on s.order_id = r.order_id
    )
    insert into fact_refunds_day (workspace_id, store_id, day, reason, product_id, supplier_id, currency, refunds,
                                  amount_minor)
    select workspace_id, store_id, day, reason, product_id, supplier_id, currency, sum(refunds), sum(amount_minor)
    from rows
    group by workspace_id, store_id, day, reason, product_id, supplier_id, currency`,
    json
  )

  yield* sql.unsafe(
    `
    with ${PAIRS}
    delete from fact_deliveries_day f using pairs p where f.store_id = p.store_id and f.day = p.day`,
    json
  )
  yield* sql.unsafe(
    `
    with ${PAIRS},
    candidates as (
      select f.order_id from pairs p
      join fulfilments f on f.store_id = p.store_id and f.delivered_at >= p.starts and f.delivered_at < p.ends
      union
      select d.order_id from pairs p
      join orders o on o.store_id = p.store_id
      join deliveries d on d.order_id = o.id and d.delivered_at >= p.starts and d.delivered_at < p.ends
    ),
    arrived as (
      select f.order_id, max(coalesce(d.delivered_at, f.delivered_at)) as at,
             bool_and(coalesce(d.delivered_at, f.delivered_at) is not null) as all_arrived
      from fulfilments f left join deliveries d on d.fulfilment_id = f.id
      where f.order_id in (select order_id from candidates)
        and f.status not in ('cancelled', 'error', 'failure')
      group by f.order_id
    ),
    delivered as (
      select o.id, o.workspace_id, o.store_id, p.day, o.shipping_address ->> 'country' as country,
             (o.placed_at at time zone p.tz)::date as placed_day,
             (o.promised_by at time zone p.tz)::date as promised_day,
             o.delayed_at is not null as flagged
      from arrived a
      join orders o on o.id = a.order_id
      join pairs p on p.store_id = o.store_id and a.at >= p.starts and a.at < p.ends
      where a.all_arrived and not o.is_draft and o.status <> 'cancelled'
    ),
    first_line as (
      select distinct on (ol.order_id) ol.order_id, ps.supplier_id
      from order_lines ol left join product_supply ps on ps.product_id = ol.product_id and ps.is_primary
      where ol.order_id in (select id from delivered)
      order by ol.order_id, ol.id
    ),
    rows as (
      select d.workspace_id, d.store_id, d.day, l.supplier_id, nullif(d.country, '') as country,
             case when d.promised_day is not null then d.day > d.promised_day else d.flagged end as late,
             case when d.promised_day is not null and d.day > d.promised_day then d.day - d.promised_day else 0 end
               as days_late,
             d.day - d.placed_day as took
      from delivered d left join first_line l on l.order_id = d.id
    )
    insert into fact_deliveries_day (workspace_id, store_id, day, supplier_id, country, parcels, on_time, late,
                                     days_late_sum, took_days_sum)
    select workspace_id, store_id, day, supplier_id, country, count(*), count(*) filter (where not late),
           count(*) filter (where late), sum(days_late), sum(took)
    from rows
    group by workspace_id, store_id, day, supplier_id, country`,
    json
  )

  // Disputes by the day they were opened, in the same store-days (migration 0078 keeps them on every write).
  yield* sql`
    select facts_disputes_rebuild(app_workspace_id(), ${marks.map((m) => m.storeId)}::text[],
                                  ${marks.map((m) => m.day)}::date[])`
})

/** The workspace's cases without a store, on these workspace days, recomputed (they hold no store-day to mark). */
const rebuildUnstored = (sql: SqlClient.SqlClient, days: Statement.Fragment) =>
  sql`
    select facts_disputes_rebuild(app_workspace_id(), array_agg(null::text), array_agg(d.day))
    from (${days}) d(day)`

/**
 * One batch of marked days recomputed and unmarked; how many. Marks another transaction holds (a concurrent drain) are
 * skipped, and a write that commits meanwhile marks its day again, so nothing it changed is lost.
 */
export const drain = Effect.fn("Facts.drain")(function*(sql: SqlClient.SqlClient, limit: number = BATCH_DAYS) {
  const marks = yield* sql<{ storeId: string; day: string }>`
    select store_id, day::text as day from fact_dirty_days order by marked_at, store_id, day
    limit ${limit} for update skip locked`
  if (marks.length === 0) return 0
  yield* rebuild(sql, marks)
  yield* sql`
    delete from fact_dirty_days d
    using jsonb_to_recordset(${JSON.stringify(marks.map((m) => ({ store_id: m.storeId, day: m.day })))}::jsonb)
      as m(store_id text, day date)
    where d.store_id = m.store_id and d.day = m.day`
  return marks.length
})

/** The nightly pass (domain.md §10): the last three days of each of the workspace's stores marked, in its timezone. */
export const markRecent = Effect.fn("Facts.markRecent")(function*(sql: SqlClient.SqlClient) {
  const marked = yield* sql<{ storeId: string }>`
    insert into fact_dirty_days (workspace_id, store_id, day)
    select s.workspace_id, s.id, (now() at time zone coalesce(s.timezone, w.timezone))::date - back
    from stores s join workspaces w on w.id = s.workspace_id cross join generate_series(0, 2) as back
    on conflict (store_id, day) do nothing
    returning store_id`
  yield* rebuildUnstored(
    sql,
    sql`select (now() at time zone w.timezone)::date - back from workspaces w
        cross join generate_series(0, 2) as back where w.id = app_workspace_id()`
  )
  return marked.length
})

/** Every day the workspace's orders count on, marked, and the facts emptied: the next drains rebuild them whole. */
export const markAll = Effect.fn("Facts.markAll")(function*(sql: SqlClient.SqlClient) {
  yield* sql`delete from fact_orders_day`
  yield* sql`delete from fact_refunds_day`
  yield* sql`delete from fact_deliveries_day`
  yield* sql`delete from fact_disputes_day`
  yield* sql`
    select facts_mark(array_agg(id), array_agg(null::timestamptz)) from orders`
  yield* sql`
    select facts_mark_days(array_agg(store_id), array_agg(opened_at)) from chargebacks where store_id is not null`
  yield* rebuildUnstored(
    sql,
    sql`select distinct (c.opened_at at time zone w.timezone)::date from chargebacks c
        join workspaces w on w.id = c.workspace_id where c.store_id is null`
  )
})

/**
 * The facts for a window, per day and store (and currency), summed over the other dimensions, inside the principal's
 * stores (§0.5). For Start's figures (M10.3 switches to it) and later Analyse. Reading a figure is gated by the screen
 * that shows it; this only narrows to the stores.
 */
export const range = Effect.fn("Facts.range")(function*(input: typeof RangeInput.Type) {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "f.store_id", input.storeId)
      const window = sql`f.day between ${input.from}::date and ${input.to}::date`
      const orders = yield* sql<{
        day: string
        storeId: string
        currency: string
        orders: number
        paidOrders: number
        countedOrders: number
        countedRevenueMinor: string
        units: number
        revenueMinor: string
        refunds: number
        refundedMinor: string
        cancelled: number
      }>`
        select f.day::text as day, f.store_id, f.currency, sum(f.orders)::int as orders,
               sum(f.paid_orders)::int as paid_orders, sum(f.counted_orders)::int as counted_orders,
               sum(f.counted_revenue_minor)::text as counted_revenue_minor, sum(f.units)::int as units,
               sum(f.revenue_minor)::text as revenue_minor, sum(f.refunds)::int as refunds,
               sum(f.refunded_minor)::text as refunded_minor, sum(f.cancelled)::int as cancelled
        from fact_orders_day f where ${window} and ${scope}
        group by f.day, f.store_id, f.currency order by f.day, f.store_id, f.currency`
      const refunds = yield* sql<
        { day: string; storeId: string; currency: string; refunds: number; amountMinor: string }
      >`
        select f.day::text as day, f.store_id, f.currency, sum(f.refunds)::int as refunds,
               sum(f.amount_minor)::text as amount_minor
        from fact_refunds_day f where ${window} and ${scope}
        group by f.day, f.store_id, f.currency order by f.day, f.store_id, f.currency`
      const deliveries = yield* sql<{
        day: string
        storeId: string
        parcels: number
        onTime: number
        late: number
        daysLateSum: number
        tookDaysSum: number
      }>`
        select f.day::text as day, f.store_id, sum(f.parcels)::int as parcels, sum(f.on_time)::int as on_time,
               sum(f.late)::int as late, sum(f.days_late_sum)::int as days_late_sum,
               sum(f.took_days_sum)::int as took_days_sum
        from fact_deliveries_day f where ${window} and ${scope}
        group by f.day, f.store_id order by f.day, f.store_id`
      return new FactsRange({
        orders: orders.map((o) => ({
          ...o,
          countedRevenueMinor: Number(o.countedRevenueMinor),
          revenueMinor: Number(o.revenueMinor),
          refundedMinor: Number(o.refundedMinor)
        })),
        refunds: refunds.map((r) => ({ ...r, amountMinor: Number(r.amountMinor) })),
        deliveries
      })
    })
  )
})
