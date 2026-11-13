import type { CostLine, CostsFigures, CostsList, MonthFigures } from "@insyte/modules/costs/domain/Costs"

/* Kosten in the public shape (M13 step 5): each line's months, and each month's figures down to net profit. */

/** A month's figures in the public shape. */
const figuresV1 = (f: MonthFigures) => ({
  month: f.month,
  revenue_minor: f.revenueMinor,
  orders: f.orders,
  ads_minor: f.adsMinor,
  other_minor: f.otherMinor,
  costs_minor: f.costsMinor,
  net_minor: f.netMinor,
  margin: f.margin,
  roas: f.roas
})

const costLineV1 = (l: CostLine, months: ReadonlyArray<string>) => ({
  id: l.id,
  name: l.name,
  kind: l.kind,
  rate: l.rate,
  rate_minor: l.rateMinor,
  source: l.source,
  reads_from_source: l.readsFromSource,
  months: months.map((m) => {
    const c = l.cells[m]
    return { month: m, amount_minor: c?.amountMinor ?? 0, typed: c?.typed ?? false, source: c?.source ?? "none" }
  })
})

export const costsV1 = (list: CostsList) => ({
  currency: list.currency,
  months: list.months,
  current: list.current,
  lines: list.lines.map((l) => costLineV1(l, list.months)),
  figures: list.figures.map(figuresV1)
})

export const costFiguresV1 = (f: CostsFigures) => ({ currency: f.currency, data: f.figures.map(figuresV1) })
