import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  AnalyticsCharts,
  AnalyticsFindings,
  AnalyticsOverview,
  AnalyticsPeriods,
  type DayPoint,
  type Driver,
  type ExplainKey,
  type ExplainRef,
  Explanation,
  type Figure,
  type Finding,
  type LeadTimeRow,
  type Month,
  type PairInput,
  type Period,
  type ReasonRow,
  type RecordsInput,
  RecordsPage,
  type Span,
  type WeekdayRow
} from "../domain/Analytics.ts"
import * as Detect from "./findings.ts"
import {
  type Context,
  context,
  countedOrderIds,
  daysIn,
  deliveredOrders,
  deliveriesBy,
  footnote,
  hoursOf,
  monthsBetween,
  namesOf,
  ordersBy,
  recordsOf,
  refundedOrderIds,
  refundsBy,
  round1,
  spansOf,
  ticketsBy
} from "./reads.ts"

/*
 * Analyse's use cases (M14 step 2; widgets/02 `/analytics`, the explain drawer): the months on offer, the six figures,
 * the charts, the findings, and any of them taken apart down to the rows. Every read needs Analyse · Bekijken and
 * narrows to the role's stores; the figures read the daily facts (ADR-0017), the drawer's rows the orders themselves,
 * so the rows it lists are the rows the figure counts.
 */

/** The page the drawer reads at once (`explain-drawer.tsx`'s 40). */
export const PAGE = 40

/** How far back the pickers go. */
const MAX_MONTHS = 60

const scoped = <A, E, R>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    yield* Policy.require("analytics", 1)
    const db = yield* Db
    return yield* db.scoped(f)
  })

/** Both spans for a pair, or `Invalid` for a month that has not begun. */
const pairOf = Effect.fn("Analytics.pair")(function*(sql: SqlClient.SqlClient, input: PairInput) {
  const ctx = yield* context(sql)
  const spans = spansOf(input.a, input.b, ctx)
  if (spans === undefined) {
    return yield* new Invalid({ fields: input.a > ctx.current ? { a: "future" } : { b: "future" } })
  }
  return { ctx, ...spans }
})

/** Every month from the first order's (in the role's stores) to the current one, oldest first. */
export const monthsOf = Effect.fn("Analytics.months")(function*(sql: SqlClient.SqlClient, ctx: Context) {
  const scope = yield* inScope(sql, "o.store_id")
  const [first] = yield* sql<{ month: string | null }>`
    select to_char(min(o.placed_at at time zone coalesce(s.timezone, w.timezone)), 'YYYY-MM') as month
    from orders o join stores s on s.id = o.store_id join workspaces w on w.id = o.workspace_id
    where not o.is_draft and ${scope}`
  const from = (first?.month ?? ctx.current) as Month
  return monthsBetween(from < ctx.current ? from : ctx.current, ctx.current)
})

/** The months the pickers offer: the first order's month (in the role's stores) to the current one. */
export const periods = Effect.fn("Analytics.periods")(function*() {
  return yield* scoped((sql) =>
    Effect.gen(function*() {
      const ctx = yield* context(sql)
      const all = yield* monthsOf(sql, ctx)
      const months = all.slice(-MAX_MONTHS).map((m): Period => ({
        month: m,
        days: daysIn(m),
        inProgress: m === ctx.current,
        toDay: m === ctx.current ? ctx.today : null
      }))
      return new AnalyticsPeriods({ months, current: ctx.current })
    })
  )
})

const sumOf = <T>(xs: ReadonlyArray<T>, f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0)

/** The six figures for A and B, with what each sums and the footnote. */
export const overview = Effect.fn("Analytics.overview")(function*(input: PairInput) {
  return yield* scoped((sql) =>
    Effect.gen(function*() {
      const { ctx, A, B } = yield* pairOf(sql, input)
      const [oa, ob] = [yield* ordersBy(sql, A, []), yield* ordersBy(sql, B, [])]
      const [da, dbs] = [yield* deliveriesBy(sql, A, []), yield* deliveriesBy(sql, B, [])]
      const [ta, tb] = [yield* ticketsBy(sql, A), yield* ticketsBy(sql, B)]
      const o = (cells: typeof oa) => ({
        orders: sumOf(cells, (c) => c.orders),
        counted: sumOf(cells, (c) => c.counted),
        refunds: sumOf(cells, (c) => c.refunds),
        revenue: sumOf(cells, (c) => c.revenue),
        unconverted: sumOf(cells, (c) => c.unconverted)
      })
      const [a, b] = [o(oa), o(ob)]
      const d = (cells: typeof da) => ({
        parcels: sumOf(cells, (c) => c.parcels),
        onTime: sumOf(cells, (c) => c.onTime)
      })
      const [dA, dB] = [d(da), d(dbs)]
      const created = (cells: typeof ta) => sumOf(cells, (c) => c.created)
      const onTime = (x: typeof dA) => (x.parcels === 0 ? null : round1((x.onTime / x.parcels) * 100))
      const rate = (x: typeof a) => (x.orders === 0 ? null : (x.refunds / x.orders) * 100)
      const figures: Array<Figure> = [
        {
          id: "revenue",
          a: a.revenue,
          b: b.revenue,
          available: true,
          basis: { rows: "orders", by: "placed", a: a.counted, b: b.counted }
        },
        {
          id: "paid_orders",
          a: a.counted,
          b: b.counted,
          available: true,
          basis: { rows: "orders", by: "placed", a: a.counted, b: b.counted }
        },
        {
          id: "on_time",
          a: onTime(dA),
          b: onTime(dB),
          available: true,
          basis: { rows: "deliveries", by: "delivered", a: dA.parcels, b: dB.parcels }
        },
        {
          id: "refund_rate",
          a: rate(a),
          b: rate(b),
          available: true,
          basis: { rows: "orders", by: "placed", a: a.orders, b: b.orders }
        },
        // Chargebacks are not kept yet (M13): the figure says so rather than reading zero.
        { id: "disputes", a: null, b: null, available: false, basis: { rows: "disputes", by: "opened", a: 0, b: 0 } },
        {
          id: "resolve_hours",
          a: hoursOf(ta),
          b: hoursOf(tb),
          available: true,
          basis: { rows: "tickets", by: "created", a: created(ta), b: created(tb) }
        }
      ]
      return new AnalyticsOverview({
        currency: ctx.currency,
        A,
        B,
        figures,
        basis: yield* footnote(sql),
        unconverted: a.unconverted + b.unconverted
      })
    })
  )
})

/** Revenue by day with the estimate for the rest of a month under way (`engine.ts` `daily`). */
const dailyOf = (
  A: Span,
  a: ReadonlyArray<{ day: number; revenue: number }>,
  b: ReadonlyArray<{ day: number; revenue: number }>
) => {
  const on = (xs: typeof a, d: number) => xs.find((x) => x.day === d)?.revenue ?? 0
  const out: Array<{ -readonly [K in keyof DayPoint]: DayPoint[K] }> = []
  for (let d = 1; d <= A.days; d++) out.push({ day: d, a: on(a, d), b: on(b, d), forecast: null, band: null })
  const length = daysIn(A.month)
  if (A.inProgress && A.days < length) {
    const last = out.slice(-14).map((p) => p.a ?? 0)
    const mean = last.length === 0 ? 0 : sumOf(last, (x) => x) / last.length
    const sd = Math.sqrt(last.length === 0 ? 0 : sumOf(last, (x) => (x - mean) ** 2) / last.length)
    const end = out[out.length - 1]
    if (end !== undefined) {
      end.forecast = end.a ?? 0
      end.band = [end.a ?? 0, end.a ?? 0]
    }
    for (let d = A.days + 1; d <= length; d++) {
      out.push({
        day: d,
        a: null,
        b: null,
        forecast: Math.round(mean),
        band: [Math.round(Math.max(0, mean - sd * 1.28)), Math.round(mean + sd * 1.28)]
      })
    }
  }
  return out
}

/** Reason counts for both periods, A's largest first. */
const reasonsOf = (a: ReadonlyArray<{ reason: string | null; refunds: number }>, b: typeof a): Array<ReasonRow> => {
  const g = (xs: typeof a) => {
    const m = new Map<string, number>()
    for (const x of xs) m.set(x.reason ?? "", (m.get(x.reason ?? "") ?? 0) + x.refunds)
    return m
  }
  const [ga, gb] = [g(a), g(b)]
  return [...new Set([...ga.keys(), ...gb.keys()])]
    .map((k) => ({ reason: k === "" ? null : k, a: ga.get(k) ?? 0, b: gb.get(k) ?? 0 }))
    .sort((x, y) => y.a - x.a)
}

/** The finding column's charts. */
export const charts = Effect.fn("Analytics.charts")(function*(input: PairInput) {
  return yield* scoped((sql) =>
    Effect.gen(function*() {
      const { ctx, A, B } = yield* pairOf(sql, input)
      const byDay = (cells: ReadonlyArray<{ dims: Readonly<Record<string, string | null>>; revenue: number }>) =>
        cells.map((c) => ({ day: Number((c.dims["day"] ?? "0000-00-00").slice(8, 10)), revenue: c.revenue }))
      const daily = dailyOf(A, byDay(yield* ordersBy(sql, A, ["day"])), byDay(yield* ordersBy(sql, B, ["day"])))

      const perSupplier = yield* deliveriesBy(sql, A, ["supplier_id"])
      const scope = yield* inScope(sql, "d.store_id")
      const dots = yield* sql<{ supplierId: string | null; orderId: string; daysLate: number }>`
        select x.supplier_id, x.id as order_id, x.days_late from (
          select d.supplier_id, d.id, d.days_late,
                 row_number() over (partition by d.supplier_id order by md5(d.id)) as k
          from ${deliveredOrders(sql, scope, A.from, A.to)} d) x
        where x.k <= 240`
      const names = yield* namesOf(sql, {
        suppliers: perSupplier.flatMap((c) => (c.dims["supplier_id"] ? [c.dims["supplier_id"]] : []))
      })
      const leadTimes: Array<LeadTimeRow> = perSupplier
        .filter((c) => c.parcels > 0)
        .map((c) => {
          const id = c.dims["supplier_id"] ?? null
          return {
            supplierId: id,
            name: id === null ? null : (names.suppliers.get(id) ?? null),
            n: c.parcels,
            late: c.late,
            dots: dots.filter((d) => d.supplierId === id).map((d) => ({
              orderId: d.orderId,
              daysLate: Number(d.daysLate)
            }))
          }
        })
        .sort((x, y) => (x.name ?? "￿").localeCompare(y.name ?? "￿"))

      const support = yield* ticketsBy(sql, A)
      const supportB = yield* ticketsBy(sql, B)
      const supportByWeekday: Array<WeekdayRow> = [1, 2, 3, 4, 5, 6, 0].map((w) => ({
        weekday: w,
        a: hoursOf(support.filter((c) => c.weekday === w)) ?? 0,
        b: hoursOf(supportB.filter((c) => c.weekday === w)) ?? 0,
        n: sumOf(support.filter((c) => c.weekday === w), (c) => c.created)
      }))
      return new AnalyticsCharts({
        currency: ctx.currency,
        A,
        B,
        daily,
        leadTimes,
        refundReasons: reasonsOf(yield* refundsBy(sql, A), yield* refundsBy(sql, B)),
        disputeReasons: null,
        supportByWeekday
      })
    })
  )
})

/** "Wat Insyte vond": every detector over the two periods, heaviest first, each with its rows counted. */
export const findings = Effect.fn("Analytics.findings")(function*(input: PairInput) {
  return yield* scoped((sql) =>
    Effect.gen(function*() {
      const { ctx, A, B } = yield* pairOf(sql, input)
      const [psA, psB] = [
        yield* ordersBy(sql, A, ["product_id", "store_id"]),
        yield* ordersBy(sql, B, ["product_id", "store_id"])
      ]
      const [chA, chB] = [
        yield* ordersBy(sql, A, ["channel", "store_id"]),
        yield* ordersBy(sql, B, ["channel", "store_id"])
      ]
      const [prodA, prodB] = [yield* ordersBy(sql, A, ["product_id"]), yield* ordersBy(sql, B, ["product_id"])]
      const [scA, scB] = [
        yield* deliveriesBy(sql, A, ["supplier_id", "country"]),
        yield* deliveriesBy(sql, B, ["supplier_id", "country"])
      ]
      const [rA, rB] = [yield* refundsBy(sql, A), yield* refundsBy(sql, B)]
      const [tA, tB] = [yield* ticketsBy(sql, A), yield* ticketsBy(sql, B)]
      const ids = (cells: ReadonlyArray<{ dims: Readonly<Record<string, string | null>> }>, dim: string) =>
        cells.flatMap((c) => (c.dims[dim] ? [c.dims[dim]] : []))
      const names = yield* namesOf(sql, {
        stores: [...ids([...psA, ...psB, ...chA, ...chB], "store_id")],
        products: [...ids([...psA, ...psB], "product_id"), ...rA.flatMap((r) => (r.productId ? [r.productId] : []))],
        suppliers: ids([...scA, ...scB], "supplier_id")
      })
      const found = [
        Detect.revenue(psA, psB, names),
        Detect.delivery(scA, scB, names),
        Detect.refunds(rA, rB, prodA, prodB, names),
        Detect.support(tA, tB),
        Detect.growth(chA, chB, names)
      ].filter((f) => f !== undefined)
      const out: Array<Finding> = []
      for (const f of found) {
        out.push({ ...f, recordCount: f.records === null ? 0 : yield* countOf(sql, A, f.records) })
      }
      return new AnalyticsFindings({
        currency: ctx.currency,
        A,
        B,
        findings: out.sort((x, y) => y.weight - x.weight)
      })
    })
  )
})

/** The orders behind a key in A, as a select of `id`; none for tickets. */
const idsOf = Effect.fn("Analytics.ids")(function*(sql: SqlClient.SqlClient, A: Span, key: ExplainKey) {
  const scope = yield* inScope(sql, "o.store_id")
  const counted = (extra: Statement.Fragment) => countedOrderIds(sql, scope, A.from, A.to, extra)
  switch (key._tag) {
    case "paid_orders":
      return counted(sql`true`)
    case "day": {
      const day = `${A.month}-${String(key.day).padStart(2, "0")}`
      return countedOrderIds(sql, scope, day, day, sql`true`)
    }
    case "product_store":
      return counted(sql`o.store_id = ${key.storeId} and exists (
        select 1 from order_lines ol where ol.order_id = o.id
          and ${key.productId === null ? sql`ol.product_id is null` : sql`ol.product_id = ${key.productId}`})`)
    case "channel":
      return counted(key.channel === null ? sql`nullif(o.channel, '') is null` : sql`o.channel = ${key.channel}`)
    case "refund_reason":
      return refundedOrderIds(sql, scope, A.from, A.to, key.reason)
    case "supplier_late":
    case "supplier_country": {
      const dscope = yield* inScope(sql, "o.store_id")
      const supplier = key.supplierId === null ? sql`d.supplier_id is null` : sql`d.supplier_id = ${key.supplierId}`
      const country = key._tag === "supplier_country" ?
        (key.country === null ? sql`d.country is null` : sql`d.country = ${key.country}`) :
        sql`true`
      return sql`select d.id from ${deliveredOrders(sql, dscope, A.from, A.to)} d
                 where d.late and ${supplier} and ${country}`
    }
    case "weekday":
      return undefined
  }
})

const countOf = Effect.fn("Analytics.count")(function*(sql: SqlClient.SqlClient, A: Span, key: ExplainKey) {
  const ids = yield* idsOf(sql, A, key)
  if (ids === undefined) return 0
  const [row] = yield* sql<{ n: number }>`select count(*)::int as n from (${ids}) x`
  return row?.n ?? 0
})

const driver = (
  dim: Driver["dim"],
  key: string,
  name: string | null,
  a: number,
  b: number,
  n: number | null = null
): Driver => ({ dim, key, name, a, b, n })

/** Both periods' values by a key, largest change first. */
const paired = <T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>, key: (x: T) => string, value: (x: T) => number) => {
  const g = (xs: ReadonlyArray<T>) => {
    const m = new Map<string, number>()
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + value(x))
    return m
  }
  const [ga, gb] = [g(a), g(b)]
  return [...new Set([...ga.keys(), ...gb.keys()])]
    .map((k) => ({ k, a: ga.get(k) ?? 0, b: gb.get(k) ?? 0 }))
    .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))
}

/** A figure, a chart's mark or a finding taken apart: its value in A and B, what moved it, and how many rows. */
export const explain = Effect.fn("Analytics.explain")(function*(ref: ExplainRef) {
  return yield* scoped((sql) =>
    Effect.gen(function*() {
      const { ctx, A, B } = yield* pairOf(sql, ref)
      const key = ref.key
      if (key._tag === "day" && key.day > A.days) return yield* new Invalid({ fields: { day: "outside" } })
      let a = 0
      let b = 0
      let of: number | null = null
      let name: string | null = null
      let drivers: Array<Driver> = []
      const store = (c: { dims: Readonly<Record<string, string | null>> }) => c.dims["store_id"] ?? ""
      switch (key._tag) {
        case "paid_orders": {
          const [ca, cb] = [yield* ordersBy(sql, A, ["store_id"]), yield* ordersBy(sql, B, ["store_id"])]
          const names = yield* namesOf(sql, { stores: [...ca, ...cb].map(store) })
          a = sumOf(ca, (c) => c.counted)
          b = sumOf(cb, (c) => c.counted)
          of = a === 0 ? 0 : Math.round(sumOf(ca, (c) => c.revenue) / a)
          drivers = paired(ca, cb, store, (c) => c.counted).map((m) =>
            driver("store", m.k, names.stores.get(m.k) ?? null, m.a, m.b)
          )
          break
        }
        case "day": {
          const dayOf = (s: Span) => `${s.month}-${String(key.day).padStart(2, "0")}`
          const one = (s: Span): Span => ({ ...s, from: dayOf(s), to: dayOf(s), days: 1 })
          const [ca, cb] = [yield* ordersBy(sql, one(A), ["store_id"]), yield* ordersBy(sql, one(B), ["store_id"])]
          const names = yield* namesOf(sql, { stores: [...ca, ...cb].map(store) })
          a = sumOf(ca, (c) => c.revenue)
          b = sumOf(cb, (c) => c.revenue)
          of = sumOf(ca, (c) => c.counted)
          drivers = paired(ca, cb, store, (c) => c.revenue).map((m) =>
            driver("store", m.k, names.stores.get(m.k) ?? null, m.a, m.b)
          )
          break
        }
        case "supplier_late": {
          const cells = (yield* deliveriesBy(sql, A, ["supplier_id", "country"]))
            .filter((c) => (c.dims["supplier_id"] ?? null) === key.supplierId)
          const names = yield* namesOf(sql, { suppliers: key.supplierId === null ? [] : [key.supplierId] })
          a = sumOf(cells, (c) => c.late)
          of = sumOf(cells, (c) => c.parcels)
          name = key.supplierId === null ? null : (names.suppliers.get(key.supplierId) ?? null)
          drivers = cells.filter((c) => c.late > 0)
            .map((c) => driver("country", c.dims["country"] ?? "", null, c.late, 0))
            .sort((x, y) => y.a - x.a)
          break
        }
        case "refund_reason": {
          const mine = <T extends { reason: string | null }>(cells: ReadonlyArray<T>) =>
            cells.filter((c) => (c.reason ?? null) === key.reason)
          const [ra, rb] = [mine(yield* refundsBy(sql, A)), mine(yield* refundsBy(sql, B))]
          const product = (c: { productId: string | null }) => c.productId ?? ""
          const names = yield* namesOf(sql, {
            products: [...ra, ...rb].flatMap((c) => (c.productId ? [c.productId] : []))
          })
          a = sumOf(ra, (c) => c.refunds)
          b = sumOf(rb, (c) => c.refunds)
          drivers = paired(ra, rb, product, (c) => c.refunds).slice(0, 6).map((m) =>
            driver("product", m.k, names.products.get(m.k) ?? null, m.a, m.b)
          )
          break
        }
        case "weekday": {
          const [ta, tb] = [yield* ticketsBy(sql, A), yield* ticketsBy(sql, B)]
          const day = (cells: typeof ta) => cells.filter((c) => c.weekday === key.weekday)
          a = hoursOf(day(ta)) ?? 0
          b = hoursOf(day(tb)) ?? 0
          of = hoursOf(ta) ?? 0
          drivers = paired(day(ta), [], (c) => c.topic ?? "", (c) => c.created)
            .filter((m) => m.a > 0)
            .sort((x, y) => y.a - x.a)
            .map((m) => driver("topic", m.k, null, m.a, 0, m.a))
          break
        }
        case "product_store":
        case "supplier_country":
        case "channel":
          // A finding's own rows: the finding already carries its numbers and what moved it.
          break
      }
      return new Explanation({
        ref,
        currency: ctx.currency,
        A,
        B,
        a,
        b,
        of,
        name,
        drivers,
        recordCount: yield* countOf(sql, A, key)
      })
    })
  )
})

/** A page of the orders behind an explanation, newest first. */
export const records = Effect.fn("Analytics.records")(function*(input: RecordsInput) {
  return yield* scoped((sql) =>
    Effect.gen(function*() {
      const { A } = yield* pairOf(sql, input.explainKey)
      const ids = yield* idsOf(sql, A, input.explainKey.key)
      if (ids === undefined) return new RecordsPage({ rows: [], next: null })
      return new RecordsPage(yield* recordsOf(sql, ids, input.cursor, PAGE))
    })
  )
})
