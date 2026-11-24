import { ORDERS, PRODUCTS, VAT } from "./records.ts"
import type { Order } from "./records.ts"

/**
 * Kosten: what it costs to run Northwind, so revenue becomes net profit, per day of Analyse's week
 * (16–22 nov) and for today until 14:30. Rebuilt from the current demo's `lib/costs.ts` and
 * `mock-data/costs.ts` on this version's records: revenue and orders are the orders in
 * `fixtures/records.ts` (so the week is € 48.210 excl. btw over 1.204 orders, as in Analyse), and the
 * purchase price is each order line's product cost, not a guessed percentage.
 *
 * A line is one of five kinds: a fixed amount per month (the team, Shopify), an amount per order
 * (packaging), a share of revenue (payment fees), ad spend (read from a connected account, or typed
 * from the invoices), or the purchase price read from the orders. Sheets reads these same figures
 * through `INSYTE()` (`fixtures/sheets.ts`), so a sheet and this page agree to the euro.
 */

export type CostKind = "inkoop" | "vast" | "per-bestelling" | "percentage" | "advertenties"
export type CostSource = "bestellingen" | "getypt" | "meta"

export const KIND_LABEL: Readonly<Record<CostKind, string>> = {
  inkoop: "Uit de bestellingen",
  vast: "Vast per maand",
  "per-bestelling": "Per bestelling",
  percentage: "Deel van de omzet",
  advertenties: "Advertenties"
}

export type CostLine = {
  readonly id: string
  readonly name: string
  readonly kind: CostKind
  readonly source: CostSource
  /** Vast: per month. Per bestelling: per order. Percentage: 0–100. Advertenties (getypt): per week. */
  readonly amount: number
  /** What a month really cost, typed in the month grid, by month key (`2026-09`); overrides `amount`. */
  readonly months?: Readonly<Record<string, number>>
}

export const COST_LINES: ReadonlyArray<CostLine> = [
  { id: "inkoop", name: "Inkoop bij leveranciers", kind: "inkoop", source: "bestellingen", amount: 0 },
  { id: "betaalkosten", name: "Betaalkosten (Stripe, Klarna)", kind: "percentage", source: "getypt", amount: 2.9 },
  { id: "verpakking", name: "Verpakking", kind: "per-bestelling", source: "getypt", amount: 1.4 },
  { id: "team", name: "Team", kind: "vast", source: "getypt", amount: 18_400 },
  { id: "shopify", name: "Shopify Advanced", kind: "vast", source: "getypt", amount: 399 },
  { id: "apps", name: "Apps en abonnementen", kind: "vast", source: "getypt", amount: 640 },
  { id: "meta", name: "Meta Ads", kind: "advertenties", source: "meta", amount: 0 },
  { id: "google", name: "Google Ads", kind: "advertenties", source: "getypt", amount: 690 }
]

/** One day of the period: its key (what `INSYTE()` asks for), its label and the orders in it. */
export type Day = {
  readonly key: string
  readonly label: string
  readonly short: string
  readonly orders: ReadonlyArray<Order>
}

const DAY_NAMES = ["zo", "ma", "di", "wo", "do", "vr", "za"]
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

function day(date: Date, until?: number): Day {
  const from = startOf(date)
  const to = until ?? from + 86_400_000
  const key = `2026-11-${String(date.getDate()).padStart(2, "0")}`
  return {
    key,
    label: `${DAY_NAMES[date.getDay()]} ${date.getDate()} nov`,
    short: DAY_NAMES[date.getDay()] ?? "",
    orders: ORDERS.filter((o) => o.placedAt.getTime() >= from && o.placedAt.getTime() < to)
  }
}

/** Analyse's week, Monday 16 to Sunday 22 November. */
export const WEEK: ReadonlyArray<Day> = Array.from({ length: 7 }, (_, i) => day(new Date(2026, 10, 16 + i)))
/** Today until 14:30. */
export const TODAY_DAY: Day = day(new Date(2026, 10, 23), new Date(2026, 10, 23, 14, 30).getTime())

export type Period = "week" | "vandaag"
export const PERIOD_LABEL: Readonly<Record<Period, string>> = { week: "16–22 nov", vandaag: "Vandaag tot 14:30" }
export const daysOf = (p: Period): ReadonlyArray<Day> => (p === "week" ? WEEK : [TODAY_DAY])

/** Revenue excl. btw, as Analyse counts it. */
export const revenueOf = (d: Day) => d.orders.reduce((n, o) => n + o.total, 0) / VAT
export const ordersOf = (d: Day) => d.orders.length
export const refundsOf = (d: Day) => d.orders.filter((o) => o.status === "terugbetaald").length

/** What the products in a day's orders cost at the supplier. */
export function purchaseOf(d: Day): number {
  let n = 0
  for (const o of d.orders) {
    if (o.status === "geannuleerd") continue
    for (const l of o.lines) n += (PRODUCTS.find((p) => p.id === l.productId)?.cost ?? 0) * l.quantity
  }
  return n
}

/* Meta reports its own spend per day; deterministic, about a tenth of the day's revenue. */
const META_SHARE = [0.091, 0.094, 0.089, 0.096, 0.088, 0.093, 0.097, 0.092] as const
const metaOf = (d: Day) => {
  const i = d === TODAY_DAY ? 7 : WEEK.indexOf(d)
  return Math.round(revenueOf(d) * (META_SHARE[i] ?? 0.09))
}

/** A fixed monthly amount, per day (a year of 365 days). */
const perDay = (monthly: number) => (monthly * 12) / 365
/** Today until 14:30 carries the part of the day that has passed. */
const share = (d: Day) => (d === TODAY_DAY ? 14.5 / 24 : 1)

/** One line's cost on one day. */
export function costOn(line: CostLine, d: Day): number {
  switch (line.kind) {
    case "inkoop":
      return purchaseOf(d)
    case "percentage":
      return (revenueOf(d) * VAT * line.amount) / 100
    case "per-bestelling":
      return ordersOf(d) * line.amount
    case "vast":
      return perDay(line.amount) * share(d)
    case "advertenties":
      return line.source === "meta" ? metaOf(d) : (line.amount / 7) * share(d)
  }
}

export type DayFigures = {
  readonly revenue: number
  readonly orders: number
  readonly refunds: number
  readonly purchase: number
  readonly ads: number
  readonly adsMeta: number
  readonly adsGoogle: number
  readonly other: number
  readonly costs: number
  readonly net: number
  readonly margin: number
  readonly roas: number
}

export function figuresOf(lines: ReadonlyArray<CostLine>, days: ReadonlyArray<Day>): DayFigures {
  const sum = (f: (d: Day) => number) => days.reduce((n, d) => n + f(d), 0)
  const of = (pick: (l: CostLine) => boolean) => sum((d) => lines.filter(pick).reduce((n, l) => n + costOn(l, d), 0))
  const revenue = sum(revenueOf)
  const ads = of((l) => l.kind === "advertenties")
  const purchase = of((l) => l.kind === "inkoop")
  const other = of((l) => l.kind !== "advertenties" && l.kind !== "inkoop")
  const costs = ads + purchase + other
  const net = revenue - costs
  return {
    revenue,
    orders: sum(ordersOf),
    refunds: sum(refundsOf),
    purchase,
    ads,
    adsMeta: of((l) => l.kind === "advertenties" && l.source === "meta"),
    adsGoogle: of((l) => l.kind === "advertenties" && l.source !== "meta"),
    other,
    costs,
    net,
    margin: revenue === 0 ? 0 : net / revenue,
    roas: ads === 0 ? 0 : revenue / ads
  }
}

/* ── Per maand ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * The six months since the shop moved to Insyte, from the monthly totals the old exports gave: revenue
 * excl. btw, orders, the purchase price and Meta's own spend. November runs to today (23 days).
 */
export type Month = {
  readonly key: string
  readonly label: string
  readonly days: number
  readonly running: boolean
  readonly revenue: number
  readonly orders: number
  readonly purchase: number
  readonly meta: number
}

export const MONTHS: ReadonlyArray<Month> = [
  {
    key: "2026-06",
    label: "jun",
    days: 30,
    running: false,
    revenue: 168_400,
    orders: 4_190,
    purchase: 57_930,
    meta: 15_320
  },
  {
    key: "2026-07",
    label: "jul",
    days: 31,
    running: false,
    revenue: 159_200,
    orders: 3_985,
    purchase: 54_610,
    meta: 14_810
  },
  {
    key: "2026-08",
    label: "aug",
    days: 31,
    running: false,
    revenue: 171_900,
    orders: 4_310,
    purchase: 58_790,
    meta: 15_640
  },
  {
    key: "2026-09",
    label: "sep",
    days: 30,
    running: false,
    revenue: 186_300,
    orders: 4_620,
    purchase: 63_710,
    meta: 17_330
  },
  {
    key: "2026-10",
    label: "okt",
    days: 31,
    running: false,
    revenue: 204_700,
    orders: 5_080,
    purchase: 69_600,
    meta: 19_240
  },
  {
    key: "2026-11",
    label: "nov",
    days: 23,
    running: true,
    revenue: 158_600,
    orders: 3_960,
    purchase: 53_920,
    meta: 14_590
  }
]

/** Whether a line's month can be typed over: fixed amounts and ads typed from the invoice. */
export const monthEditable = (l: CostLine) => l.source === "getypt" && (l.kind === "vast" || l.kind === "advertenties")

/** One line's cost in one month: what was typed for that month, or what its basis gives. */
export function costInMonth(l: CostLine, m: Month): number {
  const typed = l.months?.[m.key]
  if (typed !== undefined) return typed
  switch (l.kind) {
    case "inkoop":
      return m.purchase
    case "percentage":
      return (m.revenue * VAT * l.amount) / 100
    case "per-bestelling":
      return m.orders * l.amount
    case "vast":
      return l.amount
    case "advertenties":
      return l.source === "meta" ? m.meta : (l.amount * m.days) / 7
  }
}

export function monthFigures(lines: ReadonlyArray<CostLine>, months: ReadonlyArray<Month>) {
  const revenue = months.reduce((n, m) => n + m.revenue, 0)
  const costs = months.reduce((n, m) => n + lines.reduce((k, l) => k + costInMonth(l, m), 0), 0)
  const net = revenue - costs
  return { revenue, costs, net, margin: revenue === 0 ? 0 : net / revenue }
}

/* ── INSYTE(): the figures a sheet may read ─────────────────────────────────────────────────────── */

export type Metric = {
  readonly id: string
  readonly label: string
  readonly pick: (f: DayFigures) => number
  readonly money: boolean
}

export const METRICS: ReadonlyArray<Metric> = [
  { id: "omzet", label: "Omzet, excl. btw", pick: (f) => f.revenue, money: true },
  { id: "bestellingen", label: "Bestellingen", pick: (f) => f.orders, money: false },
  {
    id: "gemiddelde_bestelling",
    label: "Gemiddelde bestelling",
    pick: (f) => (f.orders === 0 ? 0 : f.revenue / f.orders),
    money: true
  },
  { id: "terugbetalingen", label: "Terugbetalingen (aantal)", pick: (f) => f.refunds, money: false },
  { id: "inkoop", label: "Inkoop bij leveranciers", pick: (f) => f.purchase, money: true },
  { id: "advertentiekosten", label: "Advertentiekosten", pick: (f) => f.ads, money: true },
  { id: "advertenties_meta", label: "Advertenties Meta", pick: (f) => f.adsMeta, money: true },
  { id: "advertenties_google", label: "Advertenties Google", pick: (f) => f.adsGoogle, money: true },
  { id: "overige_kosten", label: "Overige kosten", pick: (f) => f.other, money: true },
  { id: "kosten", label: "Alle kosten", pick: (f) => f.costs, money: true },
  { id: "nettowinst", label: "Nettowinst", pick: (f) => f.net, money: true },
  { id: "marge", label: "Marge", pick: (f) => f.margin, money: false }
]

export type FigureError = { readonly error: string; readonly why: string }

/**
 * `INSYTE("omzet"; "2026-11-16")`: a figure for a day of the week, for "week" or for "vandaag".
 * Nothing or an unknown period is an error the sheet shows with its reason.
 */
export function insyte(metric: string, period: string | undefined, lines = COST_LINES): number | FigureError {
  const m = METRICS.find((x) => x.id === metric.trim().toLowerCase())
  if (m === undefined) {
    return { error: "#NAAM?", why: `Insyte kent het cijfer ‘${metric}’ niet. Kies er een via Insyte-cijfer.` }
  }
  const p = (period ?? "week").trim().toLowerCase()
  const days = p === "week" ? WEEK : p === "vandaag" ? [TODAY_DAY] : WEEK.filter((d) => d.key === p)
  if (days.length === 0) {
    return {
      error: "#N/B",
      why: `Insyte heeft geen cijfers voor ‘${
        period ?? ""
      }’. Kies een dag van 16 tot 22 november ("2026-11-16"), "week" of "vandaag".`
    }
  }
  return m.pick(figuresOf(lines, days))
}

/** "€ 48.210", "€ 1.234,50" with `cents`. */
export const money = (n: number, cents = false) =>
  `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`

export const percent = (n: number) =>
  `${(n * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
