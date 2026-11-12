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
import { monthsOf } from "./analytics.ts"
import { context, daysIn, ordersBy, type OrdersCell } from "./reads.ts"

/*
 * `Analytics.figures` (M14 step 4): what a sheet's INSYTE() cells read, in one batch per screen. Each figure is read
 * from the same counted rows and the same reads as Analyse's six (`ordersBy`, §0.1), over the whole calendar month,
 * the month under way up to today, inside the reader's stores and in the workspace's currency. The sheet is Data's
 * (`data≥1`); a figure needs Analyse · Bekijken, and a role without it gets every figure refused, not the call.
 *
 * Not kept yet, so answered as such rather than as zero: the cost figures (Kosten's `Costs.figures`, M13), what is
 * under dispute (the chargebacks, M13) and revenue by marketing channel (an order's `channel` is the Shopify source,
 * not the ad that brought it; widgets/02 Part C gap 8).
 */

const WAITS: Readonly<Record<string, FigureWaitsFor>> = {
  chargebacks: "chargebacks",
  advertentiekosten: "costs",
  overige_kosten: "costs",
  kosten: "costs",
  nettowinst: "costs",
  marge: "costs",
  roas: "costs",
  advertenties_meta: "costs",
  advertenties_google: "costs",
  omzet_meta: "channels",
  omzet_google: "channels",
  omzet_klaviyo: "channels",
  omzet_organisch: "channels"
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
      refunded: n.refunded + c.refunded
    }),
    { counted: 0, revenue: 0, refunds: 0, refunded: 0 }
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
  const read = new Map<Month, ReturnType<typeof sum>>()
  const monthTotals = (month: Month) =>
    Effect.gen(function*() {
      const hit = read.get(month)
      if (hit !== undefined) return hit
      const totals = sum(yield* ordersBy(sql, wholeMonth(month, ctx.current, ctx.today), []))
      read.set(month, totals)
      return totals
    })

  const figures: Array<FigureAnswer> = []
  for (const request of requests) {
    const id = request.metric.trim().toLowerCase()
    const refused = { value: null, waitsFor: null, rows: 0 }
    if (!METRICS.some((m) => m.id === id)) {
      figures.push(answer(request, { ...refused, resolved: null, error: "unknown_metric" }))
      continue
    }
    const resolved = resolveMonth(request.month, ctx.current) as Month | undefined
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
      rows: id === "terugbetaald" ? t.refunds : t.counted
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
