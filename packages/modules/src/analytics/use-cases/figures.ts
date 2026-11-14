import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { METRICS, resolveMonth } from "@insyte/domain/sheets"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import {
  AnalyticsFigures as Figures,
  type FigureAnswer,
  type FigureRequest,
  type FiguresInput,
  type FigureWaitsFor,
  type Month,
  type Span
} from "../domain/Analytics.ts"
import { CostFigures, type CostMonth } from "../domain/Ports.ts"
import { monthsOf } from "./analytics.ts"
import { context, daysIn, disputesBy, ordersBy, type OrdersCell } from "./reads.ts"

/*
 * `Analytics.figures` (M14 step 4): what a sheet's INSYTE() cells read, in one batch per screen. Each figure is read
 * over the whole calendar month, the month under way up to today, inside the reader's stores and in the workspace's
 * currency: the sales from the same counted rows and reads as Analyse's six (`ordersBy`, §0.1); what is under dispute
 * from the dispute facts (opened in the month, whatever came of it); the costs, net profit, margin, ROAS and the ad
 * lines per platform from Kosten's own months (`Costs.figures`, through `CostFigures`), so a sheet and Kosten agree to
 * the cent. The sheet is Data's (`data≥1`); a figure needs Analyse · Bekijken, and a role without it gets every
 * figure refused, not the call. ROAS without ad spend has no number and says so (`no_ads`).
 *
 * Not kept yet, so answered as such rather than as zero: revenue by marketing channel (an order's `channel` is the
 * Shopify source, not the ad that brought it; widgets/02 Part C gap 8).
 */

const WAITS: Readonly<Record<string, FigureWaitsFor>> = {
  omzet_meta: "channels",
  omzet_google: "channels",
  omzet_klaviyo: "channels",
  omzet_organisch: "channels"
}

/** The figures Kosten works out, and what each reads of its month. */
const COSTED: Readonly<Record<string, (m: CostMonth) => number>> = {
  advertentiekosten: (m) => m.adsMinor / 100,
  overige_kosten: (m) => m.otherMinor / 100,
  kosten: (m) => m.costsMinor / 100,
  nettowinst: (m) => m.netMinor / 100,
  marge: (m) => m.margin,
  roas: (m) => m.roas,
  advertenties_meta: (m) => m.metaMinor / 100,
  advertenties_google: (m) => m.googleMinor / 100
}

const pad = (n: number) => String(n).padStart(2, "0")

/** A whole calendar month as read: the month under way runs to today. */
const wholeMonth = (month: Month, current: Month, today: number): Span => {
  const days = month === current ? Math.min(today, daysIn(month)) : daysIn(month)
  return {
    month,
    from: `${month}-01`,
    to: `${month}-${pad(days)}`,
    days,
    full: days === daysIn(month),
    inProgress: month === current
  }
}

const sum = (cells: ReadonlyArray<OrdersCell>) =>
  cells.reduce(
    (n, c) => ({
      counted: n.counted + c.counted,
      revenue: n.revenue + c.revenue,
      refunds: n.refunds + c.refunds,
      refunded: n.refunded + c.refunded,
      unconverted: n.unconverted + c.unconverted
    }),
    { counted: 0, revenue: 0, refunds: 0, refunded: 0, unconverted: 0 }
  )

const answer = (request: FigureRequest, fields: Omit<FigureAnswer, "metric" | "month">): FigureAnswer => ({
  metric: request.metric,
  ...(request.month === undefined ? {} : { month: request.month }),
  ...fields
})

/** The figures on the request's transaction, for a sheet the server evaluates itself (an export). */
export const figuresIn = Effect.fn("Analytics.figuresIn")(function*(
  sql: SqlClient.SqlClient,
  requests: ReadonlyArray<FigureRequest>
) {
  const seesFigures = yield* Policy.require("analytics", 1).pipe(
    Effect.as(true),
    Effect.catchTag("Forbidden", () => Effect.succeed(false))
  )
  const ctx = yield* context(sql)
  const months = seesFigures ? yield* monthsOf(sql, ctx) : []
  const known = new Set(months)
  const span = (month: Month) => wholeMonth(month, ctx.current, ctx.today)
  const read = new Map<Month, ReturnType<typeof sum>>()
  const monthTotals = (month: Month) =>
    Effect.gen(function*() {
      const hit = read.get(month)
      if (hit !== undefined) return hit
      const totals = sum(yield* ordersBy(sql, span(month), []))
      read.set(month, totals)
      return totals
    })
  const disputed = new Map<Month, { readonly amount: number; readonly cases: number; readonly unconverted: number }>()
  const monthDisputes = (month: Month) =>
    Effect.gen(function*() {
      const hit = disputed.get(month)
      if (hit !== undefined) return hit
      const cells = yield* disputesBy(sql, span(month), [])
      const totals = {
        amount: cells.reduce((n, c) => n + c.amount, 0),
        cases: cells.reduce((n, c) => n + c.opened, 0),
        unconverted: cells.reduce((n, c) => n + c.unconverted, 0)
      }
      disputed.set(month, totals)
      return totals
    })

  // Every month a cost figure names, read from Kosten in one go.
  const resolvedOf = (request: FigureRequest) => resolveMonth(request.month, ctx.current) as Month | undefined
  const costMonths = seesFigures ?
    [
      ...new Set(
        requests.flatMap((r) => {
          const m = resolvedOf(r)
          return COSTED[r.metric.trim().toLowerCase()] !== undefined && m !== undefined && known.has(m) ? [m] : []
        })
      )
    ] :
    []
  const costs = new Map<string, CostMonth>()
  if (costMonths.length > 0) {
    const reader = yield* CostFigures
    // Up to the same today as the sales: a store already on tomorrow counts in neither.
    for (const m of yield* reader.months(sql, costMonths, span(ctx.current).to)) costs.set(m.month, m)
  }

  const figures: Array<FigureAnswer> = []
  for (const request of requests) {
    const id = request.metric.trim().toLowerCase()
    const refused = { value: null, waitsFor: null, rows: 0, unconverted: 0 }
    if (!METRICS.some((m) => m.id === id)) {
      figures.push(answer(request, { ...refused, resolved: null, error: "unknown_metric" }))
      continue
    }
    const resolved = resolvedOf(request)
    if (!seesFigures) {
      figures.push(answer(request, { ...refused, resolved: resolved ?? null, error: "forbidden" }))
      continue
    }
    if (resolved === undefined || !known.has(resolved)) {
      figures.push(answer(request, { ...refused, resolved: resolved ?? null, error: "no_month" }))
      continue
    }
    const waits = WAITS[id]
    if (waits !== undefined) {
      figures.push(answer(request, { ...refused, resolved, error: "unavailable", waitsFor: waits }))
      continue
    }
    const costed = COSTED[id]
    if (costed !== undefined) {
      const month = costs.get(resolved)
      if (month === undefined) {
        figures.push(answer(request, { ...refused, resolved, error: "no_month" }))
      } else if (id === "roas" && month.adsMinor === 0) {
        figures.push(
          answer(request, { ...refused, resolved, error: "no_ads", rows: month.orders, unconverted: month.unconverted })
        )
      } else {
        figures.push(answer(request, {
          resolved,
          value: costed(month),
          error: null,
          waitsFor: null,
          rows: month.orders,
          unconverted: month.unconverted
        }))
      }
      continue
    }
    if (id === "chargebacks") {
      const d = yield* monthDisputes(resolved)
      figures.push(answer(request, {
        resolved,
        value: d.amount / 100,
        error: null,
        waitsFor: null,
        rows: d.cases,
        unconverted: d.unconverted
      }))
      continue
    }
    const t = yield* monthTotals(resolved)
    const value = id === "omzet"
      ? t.revenue / 100
      : id === "bestellingen"
      ? t.counted
      : id === "gemiddelde_bestelling"
      ? (t.counted === 0 ? 0 : t.revenue / t.counted / 100)
      : t.refunded / 100
    figures.push(answer(request, {
      resolved,
      value,
      error: null,
      waitsFor: null,
      rows: id === "terugbetaald" ? t.refunds : t.counted,
      unconverted: id === "bestellingen" ? 0 : t.unconverted
    }))
  }
  return new Figures({ currency: ctx.currency, current: ctx.current, months, computedAt: Date.now(), figures })
})

/** `Analytics.figures`: the sheet is Data's, so Data · Bekijken; each figure then needs Analyse · Bekijken. */
export const figures = Effect.fn("Analytics.figures")(function*(input: FiguresInput) {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => figuresIn(sql, input.requests))
})

/**
 * The same figures outside a sheet (`/v1/analytics/figures`, MCP's `get_figures`): Analyse · Bekijken for the call, so a
 * key without it is refused rather than answered figure by figure.
 */
export const lookup = Effect.fn("Analytics.lookup")(function*(input: FiguresInput) {
  yield* Policy.require("analytics", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => figuresIn(sql, input.requests))
})
