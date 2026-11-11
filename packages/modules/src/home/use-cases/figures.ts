import { Db } from "@insyte/database/Db"
import { type AreaId, canRole } from "@insyte/domain/Permissions"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { COUNTED_PAYMENT, UNCOUNTED_STATUS } from "@insyte/domain/Revenue"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  type BoardRange,
  HomeBrief,
  HomeWidgets,
  LOW_STOCK,
  type PulseFigures,
  RevenueBreakdown,
  type WidgetPayloads,
  type WidgetsInput
} from "../domain/Home.ts"

/*
 * Start's figures (M10.3), from the live tables (the facts tables are 12.4). Everything windowed is keyed by `ago`:
 * how many days before its store's today a record's day is (0 is today). Window A is `ago < N`, window B
 * `N <= ago < 2N`, so a sum over stores in different timezones adds each store's own days. Orders are summed per
 * store-day in SQL and bucketed here, so no read carries more than a row per store and day.
 */

/** What the role holds at Bekijken or more, for each area a figure needs. */
const reads = Effect.fn("Home.reads")(function*() {
  const { role } = yield* CurrentPrincipal
  const plain = { ...role, stores: role.stores === "all" ? ("all" as const) : [...role.stores] }
  return (...areas: ReadonlyArray<AreaId>) => areas.every((a) => canRole(plain, a, 1))
})

/** An order's day in its store, its store's today, and the rate that brings its total into the workspace currency. */
const ORDER_DAYS = `
  select o.*, (o.placed_at at time zone z.tz)::date as day, (now() at time zone z.tz)::date as today,
         case when o.currency = w.currency then 1::numeric else fx.rate end as rate, fx.day as rate_day,
         (not o.is_draft and o.status not in ('${UNCOUNTED_STATUS.join("', '")}')
          and o.payment_status in ('${COUNTED_PAYMENT.join("', '")}')) as counted
  from orders o
  join stores s on s.id = o.store_id
  join workspaces w on w.id = o.workspace_id
  cross join lateral (select coalesce(s.timezone, w.timezone) as tz) z
  left join lateral (
    select f.rate, f.day from fx_rates f
    where o.currency <> w.currency and f.base = o.currency and f.quote = w.currency
      and f.day <= (o.placed_at at time zone z.tz)::date
    order by f.day desc limit 1) fx on true`

/** The orders of the last `days` store-days, in the role's stores, with `ago`. */
const recentOrders = (sql: SqlClient.SqlClient, scope: Statement.Fragment, days: number) =>
  sql`(select d.*, d.today - d.day as ago from (${sql.literal(ORDER_DAYS)}
        where o.placed_at > now() - make_interval(days => ${days + 2})) d
       where ${scope} and d.today - d.day < ${days})`

interface DayRow {
  readonly ago: number
  /** Counted orders, whether or not their total could be converted. */
  readonly orders: number
  readonly valueMinor: string
  readonly unconverted: number
}

/** Window A cut into at most 14 buckets, oldest first: each bucket's `ago` span, both ends included. */
export const buckets = (days: number): ReadonlyArray<{ readonly from: number; readonly to: number }> => {
  const n = Math.min(14, days)
  const size = days / n
  return Array.from({ length: n }, (_, i) => ({
    from: Math.round(days - i * size) - 1,
    to: Math.round(days - (i + 1) * size)
  }))
}

const inBucket = (ago: number, b: { readonly from: number; readonly to: number }) => ago <= b.from && ago >= b.to

const sumBy = <T>(rows: ReadonlyArray<T>, pick: (r: T) => number, keep: (r: T) => boolean) =>
  rows.reduce((n, r) => (keep(r) ? n + pick(r) : n), 0)

const workspaceToday = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ currency: string; today: string; tz: string }>`
      select currency, (now() at time zone timezone)::date::text as today, timezone as tz
      from workspaces where id = app_workspace_id()`,
    (rows) => rows[0]!
  )

/** Whether window B lies inside the history: the first order is at least 2N − 1 days back. */
const comparableFor = Effect.fn("Home.comparable")(function*(sql: SqlClient.SqlClient, days: number) {
  const [first] = yield* sql<{ back: number | null }>`
    select (now()::date - min(placed_at)::date) as back from orders where not is_draft`
  return first?.back !== null && first?.back !== undefined && first.back >= 2 * days - 1
})

const pulseOf = Effect.fn("Home.pulse")(function*(
  sql: SqlClient.SqlClient,
  can: (...areas: ReadonlyArray<AreaId>) => boolean,
  days: number,
  orderDays: ReadonlyArray<DayRow>
) {
  const parts = buckets(days)
  const pulse: { -readonly [K in keyof PulseFigures]: PulseFigures[K] } = {
    comparable: yield* comparableFor(sql, days)
  }
  if (can("analytics", "orders")) {
    const value = (r: DayRow) => Number(r.valueMinor)
    const a = (r: DayRow) => r.ago < days
    const b = (r: DayRow) => r.ago >= days
    pulse.revenue = {
      value: sumBy(orderDays, value, a),
      previous: sumBy(orderDays, value, b),
      spark: parts.map((p) => sumBy(orderDays, value, (r) => inBucket(r.ago, p)))
    }
    pulse.orders = {
      value: sumBy(orderDays, (r) => r.orders, a),
      previous: sumBy(orderDays, (r) => r.orders, b),
      spark: parts.map((p) => sumBy(orderDays, (r) => r.orders, (r) => inBucket(r.ago, p)))
    }
  }
  if (can("support")) {
    const scope = yield* inScope(sql, "t.store_id")
    const [open] = yield* sql<{ n: number }>`
      select count(*)::int as n from tickets t
      where t.status <> 'done' and t.archived_at is null and t.deleted_at is null and t.spam_at is null
        and (t.store_id is null or ${scope})`
    const created = yield* sql<{ ago: number; n: number }>`
      select ((now() at time zone w.timezone)::date - (t.created_at at time zone w.timezone)::date) as ago,
             count(*)::int as n
      from tickets t join workspaces w on w.id = t.workspace_id
      where t.created_at > now() - make_interval(days => ${2 * days + 1}) and t.deleted_at is null
        and t.spam_at is null and (t.store_id is null or ${scope})
      group by 1`
    const inA = created.filter((r) => r.ago < days)
    pulse.tickets = {
      open: open?.n ?? 0,
      created: sumBy(inA, (r) => r.n, () => true),
      createdBefore: sumBy(created, (r) => r.n, (r) => r.ago >= days && r.ago < 2 * days),
      spark: parts.map((p) => sumBy(created, (r) => r.n, (r) => inBucket(r.ago, p)))
    }
  }
  if (can("analytics")) {
    const scope = yield* inScope(sql, "f.store_id")
    const arrived = yield* sql<{ ago: number; parcels: number; onTime: number }>`
      select (now() at time zone z.tz)::date - (f.delivered_at at time zone z.tz)::date as ago,
             count(*)::int as parcels, count(*) filter (where o.delayed_at is null)::int as on_time
      from fulfilments f join orders o on o.id = f.order_id join stores s on s.id = f.store_id
      join workspaces w on w.id = f.workspace_id
      cross join lateral (select coalesce(s.timezone, w.timezone) as tz) z
      where f.delivered_at is not null and f.delivered_at > now() - make_interval(days => ${2 * days + 2})
        and ${scope}
      group by 1`
    const live = arrived.filter((r) => r.ago >= 0 && r.ago < 2 * days)
    const a = (r: (typeof live)[number]) => r.ago < days
    const b = (r: (typeof live)[number]) => r.ago >= days
    pulse.ontime = {
      delivered: sumBy(live, (r) => r.parcels, a),
      onTime: sumBy(live, (r) => r.onTime, a),
      deliveredBefore: sumBy(live, (r) => r.parcels, b),
      onTimeBefore: sumBy(live, (r) => r.onTime, b),
      spark: parts.map((p) => {
        const parcels = sumBy(live, (r) => r.parcels, (r) => inBucket(r.ago, p))
        return parcels === 0 ? null : (sumBy(live, (r) => r.onTime, (r) => inBucket(r.ago, p)) / parcels) * 100
      })
    }
  }
  return pulse
})

/** Counted orders and their value per `ago`, over the last 2N store-days; and those left out for want of a rate. */
const orderDaysOf = (sql: SqlClient.SqlClient, scope: Statement.Fragment, days: number) =>
  sql<DayRow>`
    select o.ago, count(*) filter (where o.counted)::int as orders,
           coalesce(round(sum(o.total_minor * o.rate) filter (where o.counted and o.rate is not null)), 0)::bigint
             as value_minor,
           count(*) filter (where o.counted and o.rate is null)::int as unconverted
    from ${recentOrders(sql, scope, 2 * days)} o group by o.ago`

const revenueWidget = (orderDays: ReadonlyArray<DayRow>, days: number, today: string) => {
  const value = (r: DayRow) => Number(r.valueMinor)
  const total = sumBy(orderDays, value, (r) => r.ago < days)
  const previous = sumBy(orderDays, value, (r) => r.ago >= days)
  const step = days > 31 ? 7 : 1
  const end = Date.parse(`${today}T00:00:00Z`)
  const points = Array.from({ length: Math.ceil(days / step) }, (_, i) => {
    const from = days - 1 - i * step
    const to = Math.max(0, from - step + 1)
    const these = orderDays.filter((r) => r.ago <= from && r.ago >= to)
    return {
      day: new Date(end - from * 86_400_000).toISOString().slice(0, 10),
      valueMinor: sumBy(these, value, () => true),
      orders: sumBy(these, (r) => r.orders, () => true)
    }
  })
  return {
    totalMinor: total,
    previousMinor: previous,
    change: previous === 0 ? null : Math.round(((total - previous) / previous) * 100),
    points,
    weekly: step === 7
  }
}

export const widgets = Effect.fn("Home.widgets")(function*(input: WidgetsInput) {
  const principal = yield* CurrentPrincipal
  const can = yield* reads()
  const db = yield* Db
  const asked = new Set(input.ids)
  const days: BoardRange = input.range
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const ws = yield* workspaceToday(sql)
      const orderScope = yield* inScope(sql, "d.store_id")
      const orderDays = yield* orderDaysOf(sql, orderScope, days)
      const pulse = yield* pulseOf(sql, can, days, orderDays)
      const out: { -readonly [K in keyof WidgetPayloads]: WidgetPayloads[K] } = {}
      const want = (id: keyof WidgetPayloads, ...areas: ReadonlyArray<AreaId>) => asked.has(id) && can(...areas)

      if (want("revenue", "analytics", "orders")) out.revenue = revenueWidget(orderDays, days, ws.today)

      if (want("orders", "orders")) {
        const [stages] = yield* sql<
          { placed: number; paid: number; atSupplier: number; shipped: number; delivered: number; delayed: number }
        >`
          select count(*) filter (where o.status = 'placed')::int as placed,
                 count(*) filter (where o.status = 'paid')::int as paid,
                 count(*) filter (where o.status = 'at_supplier')::int as at_supplier,
                 count(*) filter (where o.status = 'shipped')::int as shipped,
                 count(*) filter (where o.status = 'delivered')::int as delivered,
                 count(*) filter (where o.delayed_at is not null and o.status in ('paid', 'at_supplier', 'shipped'))::int
                   as delayed
          from ${recentOrders(sql, orderScope, days)} o where not o.is_draft`
        out.orders = {
          stages: {
            placed: stages?.placed ?? 0,
            paid: stages?.paid ?? 0,
            at_supplier: stages?.atSupplier ?? 0,
            shipped: stages?.shipped ?? 0,
            delivered: stages?.delivered ?? 0
          },
          delayed: stages?.delayed ?? 0
        }
      }

      if (want("suppliers", "suppliers", "orders")) {
        const scope = yield* inScope(sql, "o.store_id")
        const rows = yield* sql<{ id: string; name: string; open: number; delayed: number }>`
          select x.id, x.name, count(distinct w.order_id)::int as open,
                 count(distinct w.order_id) filter (where o.delayed_at is not null or w.handoff_by < now())::int
                   as delayed
          from supplier_work w join suppliers x on x.id = w.supplier_id join orders o on o.id = w.order_id
          where w.status in ('to_accept', 'to_ship', 'problem') and ${scope}
          group by x.id, x.name order by delayed desc, open desc, x.name limit 5`
        out.suppliers = { rows }
      }

      if (want("tickets", "support") || want("mytickets", "support")) {
        const scope = yield* inScope(sql, "t.store_id")
        const kept = sql`t.archived_at is null and t.deleted_at is null and t.spam_at is null
                         and (t.store_id is null or ${scope})`
        if (asked.has("tickets")) {
          const [c] = yield* sql<
            { intake: number; inProgress: number; awaitingReply: number; done: number; high: number }
          >`
            select count(*) filter (where t.status = 'intake')::int as intake,
                   count(*) filter (where t.status = 'in_progress')::int as in_progress,
                   count(*) filter (where t.status = 'awaiting_reply')::int as awaiting_reply,
                   count(*) filter (where t.status = 'done')::int as done,
                   count(*) filter (where t.status <> 'done' and t.priority = 'high')::int as high
            from tickets t where ${kept}`
          out.tickets = {
            columns: {
              intake: c?.intake ?? 0,
              in_progress: c?.inProgress ?? 0,
              awaiting_reply: c?.awaitingReply ?? 0,
              done: c?.done ?? 0
            },
            high: c?.high ?? 0
          }
        }
        if (asked.has("mytickets")) {
          const mine = sql`${kept} and t.status <> 'done'
            and exists (select 1 from ticket_assignees a where a.ticket_id = t.id and a.member_id = ${principal.id})`
          const rows = yield* sql<{ id: string; number: string; title: string; priority: "low" | "medium" | "high" }>`
            select t.id, t.number::text as number, t.title, t.priority from tickets t where ${mine}
            order by case t.priority when 'high' then 0 when 'medium' then 1 else 2 end, t.updated_at desc limit 5`
          const [total] = yield* sql<{ n: number }>`select count(*)::int as n from tickets t where ${mine}`
          out.mytickets = { rows, total: total?.n ?? 0 }
        }
      }

      if (want("stock", "products")) {
        const scope = yield* inScope(sql, "p.store_id")
        const rows = yield* sql<
          { variantId: string; productId: string; product: string; variant: string; sku: string | null; left: number }
        >`
          select v.id as variant_id, p.id as product_id, p.title as product, v.title as variant, v.sku,
                 coalesce(sum(i.available), 0)::int as "left"
          from variants v join products p on p.id = v.product_id
          left join inventory_levels i on i.variant_id = v.id and i.source = 'shopify'
          where p.status = 'active' and ${scope}
          group by v.id, p.id, p.title, v.title, v.sku, v.position
          having coalesce(sum(i.available), 0) <= ${LOW_STOCK}
          order by "left", p.title, v.position limit 5`
        out.stock = { rows }
      }

      if (want("returns", "returns")) {
        const scope = yield* inScope(sql, "r.store_id")
        const rows = yield* sql<
          { id: string; number: string; customerName: string; status: "review" | "ready"; late: boolean }
        >`
          select r.id, r.number, r.customer_name, r.status,
                 (r.status = 'review' and r.review_deadline < now()) as late
          from returns r where r.status in ('review', 'ready') and ${scope}
          order by r.status = 'review' desc, r.review_deadline, r.created_at limit 5`
        out.returns = { rows }
      }

      if (want("live", "orders")) {
        const [today] = yield* sql<{ count: number; sumMinor: string }>`
          select count(*)::int as count, coalesce(round(sum(o.total_minor * o.rate)), 0)::bigint as sum_minor
          from ${recentOrders(sql, orderScope, 1)} o where not o.is_draft`
        const scope = yield* inScope(sql, "o.store_id")
        const recent = yield* sql<{
          id: string
          number: string
          customer: string
          qty: number | null
          title: string | null
          productId: string | null
          image: string | null
          totalMinor: string
          currency: string
          country: string | null
          at: Date
        }>`
          select o.id, o.number, o.customer_name as customer, l.quantity as qty, l.title, l.product_id,
                 p.images[1] as image, o.total_minor, o.currency, o.shipping_address->>'country' as country,
                 o.placed_at as at
          from orders o
          left join lateral (select ol.quantity, ol.title, ol.product_id from order_lines ol
                             where ol.order_id = o.id order by ol.id limit 1) l on true
          left join products p on p.id = l.product_id
          where not o.is_draft and ${scope}
          order by o.placed_at desc limit 6`
        out.live = {
          today: { count: today?.count ?? 0, sumMinor: Number(today?.sumMinor ?? 0) },
          recent: recent.map((r) => ({
            id: r.id,
            number: r.number,
            customer: r.customer,
            qty: r.qty ?? 0,
            title: r.title ?? "",
            productId: r.productId,
            image: r.image,
            totalMinor: Number(r.totalMinor),
            currency: r.currency,
            country: r.country,
            at: r.at.getTime()
          }))
        }
      }

      if (want("bestsellers", "products", "analytics")) {
        const rows = yield* sql<
          {
            productId: string
            title: string
            image: string | null
            units: number
            revenueMinor: string
            stock: number
          }
        >`
          select p.id as product_id, p.title, p.images[1] as image, sum(l.quantity)::int as units,
                 coalesce(round(sum(l.quantity * l.unit_price_minor * o.rate)), 0)::bigint as revenue_minor,
                 coalesce((select sum(i.available) from inventory_levels i join variants v on v.id = i.variant_id
                           where v.product_id = p.id and i.source = 'shopify'), 0)::int as stock
          from ${recentOrders(sql, orderScope, days)} o
          join order_lines l on l.order_id = o.id join products p on p.id = l.product_id
          where o.counted and o.rate is not null
          group by p.id, p.title, p.images order by units desc, revenue_minor desc limit 5`
        out.bestsellers = { rows: rows.map((r) => ({ ...r, revenueMinor: Number(r.revenueMinor) })) }
      }

      if (want("countries", "analytics")) {
        const rows = yield* sql<{ country: string | null; orders: number }>`
          select o.shipping_address->>'country' as country, count(*)::int as orders
          from ${recentOrders(sql, orderScope, days)} o where o.counted
          group by 1 order by orders desc, country nulls last`
        out.countries = { rows }
      }

      return new HomeWidgets({
        currency: ws.currency,
        range: days,
        pulse,
        widgets: out,
        unconverted: sumBy(orderDays, (r) => r.unconverted, (r) => r.ago < days)
      })
    })
  )
})

export const brief = Effect.fn("Home.brief")(function*() {
  const can = yield* reads()
  const { role } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const areas = (["orders", "returns", "products", "settings"] as const).filter((a) => can(a))
      const stores = role.stores === "all" ? sql`true` : sql`(q.store_id is null or q.store_id = any(${[
        ...role.stores
      ]}))`
      const [queue] = yield* sql<{ needsYou: number; open: number }>`
        select count(*) filter (where q.state = 'open' and q.signal in ('red', 'amber'))::int as needs_you,
               count(*) filter (where q.state = 'open')::int as open
        from queue_items q where q.resolved_at is null and q.area = any(${areas}) and ${stores}`
      const orderScope = yield* inScope(sql, "o.store_id")
      const [orders] = yield* sql<{ any: boolean; delayed: number }>`
        select exists (select 1 from orders) as any,
               (select count(*)::int from orders o where o.delayed_at is not null
                  and o.status in ('paid', 'at_supplier', 'shipped') and ${orderScope}) as delayed`
      const ticketScope = yield* inScope(sql, "t.store_id")
      const urgent = can("support")
        ? (yield* sql<{ n: number }>`
            select count(*)::int as n from tickets t
            where t.status <> 'done' and t.priority = 'high' and t.archived_at is null and t.deleted_at is null
              and t.spam_at is null and (t.store_id is null or ${ticketScope})`)[0]?.n ?? 0
        : null
      return new HomeBrief({
        needsYou: queue?.needsYou ?? 0,
        delayed: can("orders") ? orders?.delayed ?? 0 : null,
        urgent,
        evidence: null,
        firstDay: !(orders?.any ?? false) && (queue?.open ?? 0) === 0
      })
    })
  )
})

export const revenueBreakdown = Effect.fn("Home.revenueBreakdown")(function*(range: BoardRange) {
  yield* Policy.require("analytics", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const ws = yield* workspaceToday(sql)
      const scope = yield* inScope(sql, "d.store_id")
      const counted = sql`(select * from ${recentOrders(sql, scope, 2 * range)} o where o.counted)`
      const [totals] = yield* sql<
        { totalMinor: string; count: number; previousMinor: string; extrasMinor: string; unconverted: number }
      >`
        select coalesce(round(sum(o.total_minor * o.rate) filter (where o.ago < ${range})), 0)::bigint as total_minor,
               count(*) filter (where o.ago < ${range} and o.rate is not null)::int as count,
               coalesce(round(sum(o.total_minor * o.rate) filter (where o.ago >= ${range})), 0)::bigint
                 as previous_minor,
               coalesce(round(sum((o.shipping_minor + o.tax_minor - o.discounts_minor) * o.rate)
                 filter (where o.ago < ${range})), 0)::bigint as extras_minor,
               count(*) filter (where o.ago < ${range} and o.rate is null)::int as unconverted
        from ${counted} o`
      const byStore = yield* sql<{ id: string; name: string; valueMinor: string }>`
        select s.id, s.name, coalesce(round(sum(o.total_minor * o.rate)), 0)::bigint as value_minor
        from ${counted} o join stores s on s.id = o.store_id
        where o.ago < ${range} and o.rate is not null group by s.id, s.name order by value_minor desc`
      const products = yield* sql<{ productId: string | null; title: string; units: number; valueMinor: string }>`
        select l.product_id, coalesce(p.title, l.title) as title, sum(l.quantity)::int as units,
               coalesce(round(sum(l.quantity * l.unit_price_minor * o.rate)), 0)::bigint as value_minor
        from ${counted} o join order_lines l on l.order_id = o.id left join products p on p.id = l.product_id
        where o.ago < ${range} and o.rate is not null
        group by l.product_id, coalesce(p.title, l.title) order by value_minor desc, title`
      const [excluded] = yield* sql<{ cancelled: number; refunded: number; unpaid: number }>`
        select count(*) filter (where o.status = 'cancelled')::int as cancelled,
               count(*) filter (where o.status = 'refunded')::int as refunded,
               count(*) filter (where o.status not in ('cancelled', 'refunded')
                                and o.payment_status not in ('paid', 'partially_refunded'))::int as unpaid
        from ${recentOrders(sql, scope, range)} o where not o.is_draft`
      const rates = yield* sql<{ day: string; base: string; quote: string; rate: string }>`
        select distinct o.rate_day::text as day, o.currency as base, ${ws.currency} as quote, o.rate::text as rate
        from ${counted} o where o.ago < ${range} and o.rate_day is not null order by day`
      const top = products.slice(0, 5)
      const rest = products.slice(5)
      return new RevenueBreakdown({
        currency: ws.currency,
        range,
        totalMinor: Number(totals?.totalMinor ?? 0),
        count: totals?.count ?? 0,
        previousMinor: Number(totals?.previousMinor ?? 0),
        byStore: byStore.map((s) => ({ ...s, valueMinor: Number(s.valueMinor) })),
        byProduct: top.map((p) => ({ ...p, valueMinor: Number(p.valueMinor) })),
        restCount: rest.length,
        restMinor: rest.reduce((n, p) => n + Number(p.valueMinor), 0),
        shippingTaxDiscountsMinor: Number(totals?.extrasMinor ?? 0),
        excluded: excluded ?? { cancelled: 0, refunded: 0, unpaid: 0 },
        rates: rates.map((r) => ({ ...r, rate: Number(r.rate) })),
        unconverted: totals?.unconverted ?? 0
      })
    })
  )
})
