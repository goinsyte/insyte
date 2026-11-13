import { COUNTED_PAYMENT, UNCOUNTED_STATUS } from "@insyte/domain/Revenue"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import type { Month, Span } from "../domain/Analytics.ts"

/*
 * Analyse's reads of the facts (M14 step 2): sums per period from `fact_orders_day`, `fact_deliveries_day`,
 * `fact_refunds_day` and `fact_tickets_day`, inside the role's stores (§0.5), and the rows behind them for the drawer.
 * Money is counted revenue (`@insyte/domain/Revenue`, §0.1) brought into the workspace's currency at each store-day's
 * rate, the latest `fx_rates` row on or before that day, as Kosten reads it; a day without a rate is counted in
 * `unconverted` and left out. Everything here runs in a transaction scoped to the workspace.
 */

export interface Context {
  readonly currency: string
  readonly timezone: string
  readonly current: Month
  /** Today's day of the month, in the workspace's timezone. */
  readonly today: number
}

export const context = Effect.fn("Analytics.context")(function*(sql: SqlClient.SqlClient) {
  const [row] = yield* sql<{ currency: string; timezone: string; current: string; today: number }>`
    select currency, timezone, to_char(now() at time zone timezone, 'YYYY-MM') as current,
           extract(day from now() at time zone timezone)::int as today
    from workspaces where id = app_workspace_id()`
  return {
    currency: row!.currency.trim(),
    timezone: row!.timezone,
    current: row!.current as Month,
    today: row!.today
  } satisfies Context
})

const pad = (n: number) => String(n).padStart(2, "0")

/** The days in a month. */
export const daysIn = (month: Month): number => {
  const [y, m] = month.split("-").map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Months from `from` to `to`, both included, oldest first. */
export const monthsBetween = (from: Month, to: Month): ReadonlyArray<Month> => {
  const out: Array<Month> = []
  let [y, m] = from.split("-").map(Number) as [number, number]
  for (let guard = 0; guard < 600; guard++) {
    const id = `${y}-${pad(m)}` as Month
    if (id > to) break
    out.push(id)
    m += 1
    if (m === 13) {
      m = 1
      y += 1
    }
  }
  return out
}

/** The month before. */
export const previous = (month: Month): Month => {
  const [y, m] = month.split("-").map(Number) as [number, number]
  return m === 1 ? `${y - 1}-12` as Month : `${y}-${pad(m - 1)}` as Month
}

/**
 * Both months cut to the shorter one's elapsed days (§B.0.2): the month under way runs to today, a whole month to its
 * end. A month after the current one has not begun; `undefined`.
 */
export const spansOf = (a: Month, b: Month, ctx: Context): { readonly A: Span; readonly B: Span } | undefined => {
  if (a > ctx.current || b > ctx.current) return undefined
  const len = (m: Month) => (m === ctx.current ? Math.min(ctx.today, daysIn(m)) : daysIn(m))
  const days = Math.min(len(a), len(b))
  const make = (m: Month): Span => ({
    month: m,
    from: `${m}-01`,
    to: `${m}-${pad(days)}`,
    days,
    full: days === daysIn(m),
    inProgress: m === ctx.current
  })
  return { A: make(a), B: make(b) }
}

export const round1 = (n: number) => Math.round(n * 10) / 10

/** The workspace's rate for a fact row's day and currency, as `fx.rate` (1 for the workspace's own currency). */
const FX = (day: string, currency: string) => `
  cross join (select currency from workspaces where id = app_workspace_id()) w
  left join lateral (
    select case when ${currency} = w.currency then 1::numeric else (
      select x.rate from fx_rates x
      where x.base = ${currency} and x.quote = w.currency and x.day <= ${day}
      order by x.day desc limit 1) end as rate) fx on true`

/** Dimensions of `fact_orders_day` a read may group by: trusted column names only. */
export type OrdersDim = "store_id" | "product_id" | "channel" | "day" | "country"

export interface OrdersCell {
  readonly dims: Readonly<Record<string, string | null>>
  /** Every order placed (drafts aside), counted orders, and orders with a refund since: by placed day. */
  readonly orders: number
  readonly counted: number
  readonly refunds: number
  /** Counted units. */
  readonly units: number
  /** Counted revenue in the workspace's currency. */
  readonly revenue: number
  /** Store-day cells left out of `revenue` for want of a rate. */
  readonly unconverted: number
}

/** `fact_orders_day` over a span, summed by `dims`, money converted per store-day. */
export const ordersBy = Effect.fn("Analytics.ordersBy")(function*(
  sql: SqlClient.SqlClient,
  span: Span,
  dims: ReadonlyArray<OrdersDim>
) {
  const scope = yield* inScope(sql, "f.store_id")
  const inner = dims.filter((d) => d !== "day").map((d) => `f.${d}`)
  const group = ["f.day", "f.currency", ...inner].join(", ")
  const outer = dims.map((d) => (d === "day" ? "to_char(d.day, 'YYYY-MM-DD') as day" : `d.${d}`))
  const rows = yield* sql<
    Record<string, string | null> & {
      orders: number
      counted: number
      refunds: number
      units: number
      revenue: string
      unconverted: number
    }
  >`
    with d as (
      select ${sql.literal(group)}, sum(f.orders)::bigint as orders, sum(f.counted_orders)::bigint as counted,
             sum(f.refunds)::bigint as refunds, sum(f.units)::bigint as units,
             sum(f.counted_revenue_minor) as revenue
      from fact_orders_day f
      where f.day between ${span.from}::date and ${span.to}::date and ${scope}
      group by ${sql.literal(group)}
    )
    select ${sql.literal(outer.length === 0 ? "" : `${outer.join(", ")},`)}
           sum(d.orders)::int as orders, sum(d.counted)::int as counted, sum(d.refunds)::int as refunds,
           sum(d.units)::int as units,
           coalesce(sum(round(d.revenue * fx.rate)) filter (where fx.rate is not null), 0)::text as revenue,
           count(*) filter (where fx.rate is null and d.revenue <> 0)::int as unconverted
    from d ${sql.literal(FX("d.day", "d.currency"))}
    ${sql.literal(dims.length === 0 ? "" : `group by ${dims.map((_, i) => String(i + 1)).join(", ")}`)}`
  return rows.map((r): OrdersCell => ({
    dims: Object.fromEntries(dims.map((d) => [d, (r as Record<string, string | null>)[toCamel(d)] ?? null])),
    orders: Number(r.orders),
    counted: Number(r.counted),
    refunds: Number(r.refunds),
    units: Number(r.units),
    revenue: Number(r.revenue),
    unconverted: Number(r.unconverted)
  }))
})

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

export type DeliveriesDim = "store_id" | "supplier_id" | "country"

export interface DeliveriesCell {
  readonly dims: Readonly<Record<string, string | null>>
  readonly parcels: number
  readonly onTime: number
  readonly late: number
  readonly daysLateSum: number
}

/** `fact_deliveries_day` over a span (by the day delivered), summed by `dims`. */
export const deliveriesBy = Effect.fn("Analytics.deliveriesBy")(function*(
  sql: SqlClient.SqlClient,
  span: Span,
  dims: ReadonlyArray<DeliveriesDim>
) {
  const scope = yield* inScope(sql, "f.store_id")
  const cols = dims.map((d) => `f.${d}`)
  const rows = yield* sql<
    Record<string, string | null> & { parcels: number; onTime: number; late: number; daysLateSum: number }
  >`
    select ${sql.literal(cols.length === 0 ? "" : `${cols.join(", ")},`)}
           coalesce(sum(f.parcels), 0)::int as parcels, coalesce(sum(f.on_time), 0)::int as on_time,
           coalesce(sum(f.late), 0)::int as late, coalesce(sum(f.days_late_sum), 0)::int as days_late_sum
    from fact_deliveries_day f
    where f.day between ${span.from}::date and ${span.to}::date and ${scope}
    ${sql.literal(cols.length === 0 ? "" : `group by ${cols.join(", ")}`)}`
  return rows.map((r): DeliveriesCell => ({
    dims: Object.fromEntries(dims.map((d) => [d, (r as Record<string, string | null>)[toCamel(d)] ?? null])),
    parcels: Number(r.parcels),
    onTime: Number(r.onTime),
    late: Number(r.late),
    daysLateSum: Number(r.daysLateSum)
  }))
})

export interface RefundsCell {
  readonly reason: string | null
  readonly productId: string | null
  readonly refunds: number
}

/** `fact_refunds_day` over a span (by the day refunded), counted by reason and product. */
export const refundsBy = Effect.fn("Analytics.refundsBy")(function*(sql: SqlClient.SqlClient, span: Span) {
  const scope = yield* inScope(sql, "f.store_id")
  const rows = yield* sql<{ reason: string | null; productId: string | null; refunds: number }>`
    select f.reason, f.product_id, sum(f.refunds)::int as refunds
    from fact_refunds_day f
    where f.day between ${span.from}::date and ${span.to}::date and ${scope}
    group by f.reason, f.product_id`
  return rows.map((r): RefundsCell => ({ ...r, refunds: Number(r.refunds) }))
})

export interface TicketsCell {
  readonly weekday: number
  readonly topic: string | null
  readonly created: number
  readonly resolved: number
  readonly minutes: number
}

/** `fact_tickets_day` over a span (by the day they came in), by weekday and topic; tickets without a store count. */
export const ticketsBy = Effect.fn("Analytics.ticketsBy")(function*(sql: SqlClient.SqlClient, span: Span) {
  const scope = yield* inScope(sql, "f.store_id")
  const rows = yield* sql<
    { weekday: number; topic: string | null; created: number; resolved: number; minutes: string }
  >`
    select extract(dow from f.day)::int as weekday, f.topic, sum(f.created)::int as created,
           sum(f.resolved)::int as resolved, sum(f.resolve_minutes_sum)::text as minutes
    from fact_tickets_day f
    where f.day between ${span.from}::date and ${span.to}::date and (f.store_id is null or ${scope})
    group by 1, 2`
  return rows.map((r): TicketsCell => ({ ...r, minutes: Number(r.minutes) }))
})

/** Average hours to done, to one decimal; null with nothing done. */
export const hoursOf = (cells: ReadonlyArray<TicketsCell>): number | null => {
  const resolved = cells.reduce((n, c) => n + c.resolved, 0)
  return resolved === 0 ? null : round1(cells.reduce((n, c) => n + c.minutes, 0) / resolved / 60)
}

/** The footnote: every order (drafts aside) and every ticket so far, and the first order's day in its store. */
export const footnote = Effect.fn("Analytics.footnote")(function*(sql: SqlClient.SqlClient) {
  const orders = yield* inScope(sql, "o.store_id")
  const tickets = yield* inScope(sql, "t.store_id")
  const [o] = yield* sql<{ n: number; since: string | null }>`
    select count(*)::int as n,
           to_char(min((o.placed_at at time zone coalesce(s.timezone, w.timezone))::date), 'YYYY-MM-DD') as since
    from orders o join stores s on s.id = o.store_id join workspaces w on w.id = o.workspace_id
    where not o.is_draft and ${orders}`
  const [t] = yield* sql<{ n: number }>`
    select count(*)::int as n from tickets t
    where t.deleted_at is null and t.spam_at is null and (t.store_id is null or ${tickets})`
  return { orders: o?.n ?? 0, tickets: t?.n ?? 0, since: o?.since ?? null }
})

/** Names for the ids a read returned: stores, products and suppliers. */
export const namesOf = Effect.fn("Analytics.names")(function*(
  sql: SqlClient.SqlClient,
  ids: {
    readonly stores?: ReadonlyArray<string>
    readonly products?: ReadonlyArray<string>
    readonly suppliers?: ReadonlyArray<string>
  }
) {
  const stores = (ids.stores ?? []).length === 0 ? [] : yield* sql<{ id: string; name: string }>`
    select id, name from stores where id = any(${[...(ids.stores ?? [])]})`
  const products = (ids.products ?? []).length === 0 ? [] : yield* sql<{ id: string; name: string }>`
    select id, title as name from products where id = any(${[...(ids.products ?? [])]})`
  const suppliers = (ids.suppliers ?? []).length === 0 ? [] : yield* sql<{ id: string; name: string }>`
    select id, name from suppliers where id = any(${[...(ids.suppliers ?? [])]})`
  const map = (rows: ReadonlyArray<{ id: string; name: string }>) => new Map(rows.map((r) => [r.id, r.name]))
  return { stores: map(stores), products: map(products), suppliers: map(suppliers) }
})

/* ── rows ─────────────────────────────────────────────────────────────────────────────────────── */

/** An order's store timezone, as `z.tz`, for an `orders o` already joined. */
const TZ = `join stores s on s.id = o.store_id join workspaces ws on ws.id = o.workspace_id
  cross join lateral (select coalesce(s.timezone, ws.timezone) as tz) z`

const COUNTED = `not o.is_draft and o.status not in ('${UNCOUNTED_STATUS.join("', '")}')
  and o.payment_status in ('${COUNTED_PAYMENT.join("', '")}')`

/** The ids of orders placed in `[from, to]` (store days), counted, narrowed by `extra`. */
export const countedOrderIds = (
  sql: SqlClient.SqlClient,
  scope: Statement.Fragment,
  from: string,
  to: string,
  extra: Statement.Fragment
) =>
  sql`select o.id from orders o ${sql.literal(TZ)}
      where o.placed_at >= (${from}::date - 1)::timestamptz and o.placed_at < (${to}::date + 2)::timestamptz
        and (o.placed_at at time zone z.tz)::date between ${from}::date and ${to}::date
        and ${sql.literal(COUNTED)} and ${scope} and ${extra}`

/**
 * Orders delivered in `[from, to]` (the day their last live parcel arrived, in the store's timezone; B.0.4, as the
 * facts count them), with their first line's supplier, country, and days past the promise: 0 on time, and an order
 * without a promise that Insyte flagged as delayed counts as late by 1 (the facts' rule until promises are written).
 */
export const deliveredOrders = (
  sql: SqlClient.SqlClient,
  scope: Statement.Fragment,
  from: string,
  to: string
) =>
  sql`(
    with cand as (
      select f.order_id from fulfilments f
      where f.delivered_at >= (${from}::date - 1)::timestamptz and f.delivered_at < (${to}::date + 2)::timestamptz
      union
      select d.order_id from deliveries d
      where d.delivered_at >= (${from}::date - 1)::timestamptz and d.delivered_at < (${to}::date + 2)::timestamptz
    ),
    arrived as (
      select f.order_id, max(coalesce(d.delivered_at, f.delivered_at)) as at,
             bool_and(coalesce(d.delivered_at, f.delivered_at) is not null) as all_arrived
      from fulfilments f left join deliveries d on d.fulfilment_id = f.id
      where f.order_id in (select order_id from cand) and f.status not in ('cancelled', 'error', 'failure')
      group by f.order_id
    ),
    delivered as (
      select o.id, o.store_id, o.placed_at, nullif(o.shipping_address ->> 'country', '') as country,
             (a.at at time zone z.tz)::date as day, (o.promised_by at time zone z.tz)::date as promised_day,
             o.delayed_at is not null as flagged,
             (select ps.supplier_id from order_lines ol
                left join product_supply ps on ps.product_id = ol.product_id and ps.is_primary
              where ol.order_id = o.id order by ol.id limit 1) as supplier_id
      from arrived a join orders o on o.id = a.order_id ${sql.literal(TZ)}
      where a.all_arrived and not o.is_draft and o.status <> 'cancelled' and ${scope}
    )
    select d.*,
           case when d.promised_day is not null then greatest(0, d.day - d.promised_day)
                when d.flagged then 1 else 0 end as days_late,
           case when d.promised_day is not null then d.day > d.promised_day else d.flagged end as late
    from delivered d where d.day between ${from}::date and ${to}::date
  )`

/** The ids of orders with a refund made in `[from, to]` (store days) for `reason` (null: none given). */
export const refundedOrderIds = (
  sql: SqlClient.SqlClient,
  scope: Statement.Fragment,
  from: string,
  to: string,
  reason: string | null
) =>
  sql`select distinct r.order_id as id from refunds r join orders o on o.id = r.order_id ${sql.literal(TZ)}
      where r.status = 'succeeded'
        and r.created_at >= (${from}::date - 1)::timestamptz and r.created_at < (${to}::date + 2)::timestamptz
        and (r.created_at at time zone z.tz)::date between ${from}::date and ${to}::date
        and ${reason === null ? sql`nullif(r.reason, '') is null` : sql`r.reason = ${reason}`} and ${scope}`

interface RecordRowSql {
  readonly orderId: string
  readonly number: string
  readonly placedDay: string
  readonly placedMs: string
  readonly qty: number | null
  readonly title: string | null
  readonly country: string | null
  readonly storeName: string
  readonly status: string
  readonly fulfillmentStatus: string
  readonly refundReason: string | null
  readonly arrivedDay: string | null
  readonly promisedDay: string | null
  readonly flagged: boolean
  readonly totalMinor: string
  readonly currency: string
}

/** A page of the orders in `ids` (a select of `id`), newest first, after `cursor` (`ms|id`). */
export const recordsOf = Effect.fn("Analytics.recordsOf")(function*(
  sql: SqlClient.SqlClient,
  ids: Statement.Fragment,
  cursor: string | undefined,
  limit: number
) {
  const [ms, id] = cursor === undefined ? [undefined, undefined] : cursor.split("|")
  const after = ms === undefined || id === undefined || !/^\d+$/.test(ms)
    ? sql`true`
    : sql`(o.placed_at, o.id) < (to_timestamp(${Number(ms)} / 1000.0), ${id})`
  const rows = yield* sql<RecordRowSql>`
    select o.id as order_id, o.number, to_char((o.placed_at at time zone z.tz)::date, 'YYYY-MM-DD') as placed_day,
           floor(extract(epoch from o.placed_at) * 1000)::bigint::text as placed_ms,
           l.quantity as qty, l.title, nullif(o.shipping_address ->> 'country', '') as country, s.name as store_name,
           o.status, o.fulfillment_status, rr.reason as refund_reason,
           to_char((a.at at time zone z.tz)::date, 'YYYY-MM-DD') as arrived_day,
           to_char((o.promised_by at time zone z.tz)::date, 'YYYY-MM-DD') as promised_day,
           o.delayed_at is not null as flagged, o.total_minor::text as total_minor, o.currency
    from orders o ${sql.literal(TZ)}
    left join lateral (
      select ol.quantity, ol.title from order_lines ol where ol.order_id = o.id order by ol.id limit 1) l on true
    left join lateral (
      select nullif(r.reason, '') as reason from refunds r
      where r.order_id = o.id and r.status = 'succeeded' order by r.created_at desc limit 1) rr on true
    left join lateral (
      select case when bool_and(coalesce(d.delivered_at, f.delivered_at) is not null)
                  then max(coalesce(d.delivered_at, f.delivered_at)) end as at
      from fulfilments f left join deliveries d on d.fulfilment_id = f.id
      where f.order_id = o.id and f.status not in ('cancelled', 'error', 'failure')) a on true
    where o.id in (${ids}) and ${after}
    order by o.placed_at desc, o.id desc
    limit ${limit + 1}`
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    rows: page.map((r) => {
      const daysLate = r.arrivedDay === null
        ? null
        : r.promisedDay !== null
        ? Math.max(0, (Date.parse(r.arrivedDay) - Date.parse(r.promisedDay)) / 86_400_000)
        : r.flagged
        ? 1
        : 0
      const outcome = r.status === "refunded"
        ? "refunded" as const
        : r.status === "cancelled"
        ? "cancelled" as const
        : daysLate !== null
        ? (daysLate > 0 ? "late" as const : "on_time" as const)
        : r.fulfillmentStatus === "unfulfilled"
        ? "unfulfilled" as const
        : "on_the_way" as const
      return {
        orderId: r.orderId,
        number: r.number,
        placedDay: r.placedDay,
        qty: r.qty ?? 0,
        title: r.title,
        country: r.country,
        storeName: r.storeName,
        outcome,
        refundReason: r.refundReason,
        daysLate,
        totalMinor: Number(r.totalMinor),
        currency: r.currency.trim()
      }
    }),
    next: rows.length > limit && last !== undefined ? `${last.placedMs}|${last.orderId}` : null
  }
})
