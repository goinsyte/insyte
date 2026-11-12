import type { CostCell, CostKind, Month, MonthFigures } from "./Costs.ts"

/*
 * What a line costs in a month, and the month's figures (domain.md §10.1; the design's `lib/costs.ts` is the oracle,
 * held to this by the golden test). Pure, in minor units, so the server, `/v1`, MCP and later Analyse and INSYTE()
 * read one calculation:
 *
 *   fixed      the typed amount, else 0
 *   per_order  rate_minor × counted orders
 *   percent    round(rate / 100 × revenue)
 *   ads        the typed amount (a typed amount wins), else what the connected account reports, else 0
 *
 * ads = Σ ad lines, other = Σ the rest, costs = ads + other, net = revenue − costs, margin = net / revenue (0 without
 * revenue), ROAS = revenue / ads (0 without ad spend). Revenue and orders are the facts' counted ones (`Revenue.ts`).
 */

export interface LineRule {
  readonly kind: CostKind
  readonly rate: number | null
  readonly rateMinor: number | null
  /** Typed months. */
  readonly typed: ReadonlyMap<string, number>
  /** What the account reports per month; `null` when the line reads from no connected account. */
  readonly account: ReadonlyMap<string, number> | null
}

export interface MonthBasis {
  readonly revenueMinor: number
  readonly orders: number
}

export const costOf = (line: LineRule, month: Month, basis: MonthBasis): CostCell => {
  const own = line.typed.get(month)
  if (line.kind === "per_order") {
    return { amountMinor: (line.rateMinor ?? 0) * basis.orders, typed: false, source: "rule" }
  }
  if (line.kind === "percent") {
    return { amountMinor: Math.round(((line.rate ?? 0) / 100) * basis.revenueMinor), typed: false, source: "rule" }
  }
  if (own !== undefined) return { amountMinor: own, typed: true, source: "typed" }
  if (line.kind === "ads" && line.account !== null) {
    return { amountMinor: line.account.get(month) ?? 0, typed: false, source: "account" }
  }
  return { amountMinor: 0, typed: false, source: "none" }
}

export const figuresOf = (lines: ReadonlyArray<LineRule>, month: Month, basis: MonthBasis): MonthFigures => {
  let ads = 0
  let other = 0
  for (const line of lines) {
    const { amountMinor } = costOf(line, month, basis)
    if (line.kind === "ads") ads += amountMinor
    else other += amountMinor
  }
  const costs = ads + other
  const net = basis.revenueMinor - costs
  return {
    month,
    revenueMinor: basis.revenueMinor,
    orders: basis.orders,
    adsMinor: ads,
    otherMinor: other,
    costsMinor: costs,
    netMinor: net,
    margin: basis.revenueMinor === 0 ? 0 : net / basis.revenueMinor,
    roas: ads === 0 ? 0 : basis.revenueMinor / ads
  }
}

/** `YYYY-MM` moved by `n` months. */
export const addMonths = (month: string, n: number): Month => {
  const [y, m] = month.split("-").map(Number) as [number, number]
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`
}

/** Every month from `from` to `to`, both included, oldest first. */
export const monthsBetween = (from: string, to: string): Array<Month> => {
  const out: Array<Month> = []
  for (let m = from; m <= to && out.length < 120; m = addMonths(m, 1)) out.push(m)
  return out
}
