import { BLOCKS, WEEK_DAYS, WEEK_ORDERS } from "../../fixtures/analytics.ts"
import type { Block, BlockId } from "../../fixtures/analytics.ts"
import { CHARGEBACKS } from "../../fixtures/chargebacks.ts"
import { product, supplier } from "../../fixtures/records.ts"
import { weekRefunds } from "../../fixtures/returns.ts"
import { DEMO_NOW, TODAY } from "../../fixtures/workspace.ts"
import { formatRange } from "../../ui/period.tsx"
import type { Compare, Period } from "../../ui/period.tsx"

/*
 * Analyse over any period: every day since Northwind opened (3 February 2025) until today 14:30, so
 * the period and the comparison can be anything and every block, figure, finding and answer still
 * adds up. The board's own week (16–22 nov) and the week before (9–15 nov) are the fixtures in
 * `fixtures/analytics.ts`, to the unit; today is `TODAY`; the days before are the shop's history,
 * drawn the same way every time from its growth, its weekdays and its seasons. Refunds, late parcels
 * and disputes are counted one by one per day, with what they were about, so a chart's bar and the
 * orders behind it are always the same number.
 */

const DAY = 86_400_000
/** Monday 3 February 2025: Northwind's first day of selling. Nothing to read before it. */
const OPEN = new Date(2025, 1, 3)
const dayIndex = (d: Date) =>
  Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - OPEN.getTime()) / DAY)
const dateAt = (i: number) => new Date(OPEN.getFullYear(), OPEN.getMonth(), OPEN.getDate() + i)
/** 0 is Monday, as on the boards. */
const weekday = (i: number) => ((i % 7) + 7) % 7

const W0 = dayIndex(new Date(2026, 10, 16))
const W1 = W0 - 7
const NOW = dayIndex(DEMO_NOW.date)
/** Today stops at 14:30: a day compared with it counts the same share of itself. */
const PART = TODAY.lastMonday.orders / BLOCKS.bestellingenPerDag.data.current[0]
/** The first day the chargeback list holds every dispute (`fixtures/chargebacks.ts`). */
const DISPUTES_FROM = dayIndex(new Date(2026, 9, 19))

/** A number from a day and a salt, the same every time. */
function noise(i: number, salt: number): number {
  let h = Math.imul(i + 1013, 2654435761) ^ Math.imul(salt + 7, 1597334677)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const sum = (xs: ReadonlyArray<number>) => xs.reduce((s, x) => s + x, 0)

/** Whole numbers that keep their total: each floored, the rest to the largest remainders. */
function whole(xs: ReadonlyArray<number>): Array<number> {
  const total = Math.round(sum(xs))
  const out = xs.map((x) => Math.floor(x + 1e-9))
  const order = xs.map((x, i) => ({ i, r: x - Math.floor(x + 1e-9) })).toSorted((a, b) => b.r - a.r)
  let left = total - sum(out)
  for (const { i } of order) {
    if (left <= 0) break
    out[i] = (out[i] ?? 0) + 1
    left--
  }
  return out
}

/** `total` over the days in proportion to `weights`. */
const spread = (total: number, weights: ReadonlyArray<number>) => whole(weights.map((w) => (total * w) / sum(weights)))

/** Category indices with exactly these counts, mixed through the week the same way every time. */
function deal(counts: ReadonlyArray<number>, salt: number): Array<number> {
  return counts
    .flatMap((n, c) => Array.from({ length: n }, (_, k) => ({ c, key: noise(c * 97 + k, salt) })))
    .toSorted((a, b) => a.key - b.key)
    .map((x) => x.c)
}

function pick(shares: ReadonlyArray<number>, u: number): number {
  let at = u * sum(shares)
  for (const [i, s] of shares.entries()) {
    at -= s
    if (at < 0) return i
  }
  return shares.length - 1
}

/* ── the categories, as the blocks name them, with the week's counts and the week before's ─────── */

const items = (id: "retourredenen" | "perVervoerder" | "teLaatPerLand" | "levertijd") => BLOCKS[id].data.items
const nowOf = (xs: ReadonlyArray<{ readonly value: number }>) => xs.map((x) => x.value)
const beforeOf = (xs: ReadonlyArray<{ readonly compare: number }>) => xs.map((x) => x.compare)

const REASONS = items("retourredenen").map((x) => x.label)
const CARRIERS = items("perVervoerder").map((x) => x.label)
const COUNTRIES = items("teLaatPerLand").map((x) => x.label)
/** The suppliers in Leveranciers' order, with their names and slugs. */
const SUPPLIERS = [
  { label: "Allure", id: "allure-fulfillment" },
  { label: "Kestrel", id: "kestrel-goods" },
  { label: "DPC", id: "dpc-apparel" },
  { label: "Black Cedar", id: "black-cedar-studio" }
] as const
/** The products the refunds are named by; the last is every other product. */
const NAMED = [
  "aurora-hooded-fleece",
  "coastline-bomber-jacket",
  "drift-crewneck",
  "sailor-stripe-tee",
  "boulevard-linen-shirt",
  "harbor-raincoat"
] as const
const PRODUCT_LABEL = ["Aurora", "Coastline", "Drift", "Sailor"] as const
const REST = NAMED.length

const SHARE = {
  reasons: { now: nowOf(items("retourredenen")), before: beforeOf(items("retourredenen")) },
  carriers: { now: nowOf(items("perVervoerder")), before: beforeOf(items("perVervoerder")) },
  countries: { now: nowOf(items("teLaatPerLand")), before: beforeOf(items("teLaatPerLand")) },
  /** Refunds per product: the board's "Terugbetalingen per product", with Overig split into Boulevard, Harbor and the rest. */
  products: { now: [26, 4, 3, 3, 2, 1, 2], before: [8, 6, 4, 5, 2, 2, 3] },
  /** Late parcels per supplier, in `SUPPLIERS` order. */
  late: { now: [18, 41, 22, 15], before: [16, 24, 18, 13] },
  /** Days to deliver per supplier. */
  lead: { now: nowOf(items("levertijd")), before: beforeOf(items("levertijd")) },
  /** Units sold of `NAMED`, per order of the period. */
  sold: { now: [212, 96, 154, 188, 74, 61], before: [205, 103, 154, 172, 80, 61] },
  /** Visits, product views, carts and checkouts per paid order. */
  funnel: {
    now: BLOCKS.conversie.data.steps.slice(0, 4).map((s) => s.value / 1204),
    before: [37900, 20600, 4700, 2080].map((v) => v / 1152)
  }
} as const

const era = (i: number) => (i >= W0 ? "now" : "before")

/** Stores and payment methods, as the week's orders split (`records.ts`). */
const STORE_NAME = { store_eu: "Northwind EU", store_us: "Northwind US" } as const
const STORES = Object.keys(STORE_NAME) as ReadonlyArray<keyof typeof STORE_NAME>
const PAYMENTS = BLOCKS.betaalmethode.data.items.map((x) => x.label)
const storeShare = STORES.map((s) => WEEK_ORDERS.filter((o) => o.storeId === s).length)
const paymentShare = PAYMENTS.map((p) => WEEK_ORDERS.filter((o) => o.payment === p).length)

/** Every dispute reason the list knows, the board's three first. */
const DISPUTE_REASONS = [
  ...new Set([...BLOCKS.geschillenPerReden.data.items.map((x) => x.label), ...CHARGEBACKS.map((c) => c.reason)])
]

/* ── one day ───────────────────────────────────────────────────────────────────────────────────── */

type Refund = { readonly product: number; readonly reason: number; readonly carrier: number; readonly order?: string }
type Late = { readonly supplier: number; readonly country: number; readonly days: number }
type Dispute = { readonly reason: number; readonly id?: string; readonly order?: string; readonly amount: number }

type Day = {
  readonly revenue: number
  readonly orders: number
  readonly tickets: number
  /** Minutes to the first reply, the day's median. */
  readonly reply: number
  /** Share solved within a day, in %. */
  readonly solved: number
  readonly agents: number
  readonly delivered: number
  /** Days to deliver, the day's average. */
  readonly lead: number
  readonly exchanges: number
  readonly refundEuro: number
  readonly refunds: ReadonlyArray<Refund>
  readonly late: ReadonlyArray<Late>
  readonly disputes: ReadonlyArray<Dispute>
}

const REV = BLOCKS.omzetPerDag.data
const ORD = BLOCKS.bestellingenPerDag.data
const TIX = BLOCKS.ticketsPerDag.data.items
const BASE = sum(REV.compare) / 7

/** How busy a day is against the week before the board's, from the shop's growth and its seasons. */
function level(i: number): number {
  const d = dateAt(i)
  const [y, m, day] = [d.getFullYear(), d.getMonth(), d.getDate()]
  let l = 0.3 + 0.7 * Math.min(i / W1, 1.04) ** 0.85
  if (m === 6 || m === 7) l *= 0.86
  if (m === 11) l *= day < 23 ? 1.16 : 0.82
  if (y === 2025 && m === 10 && day >= 28) l *= day === 28 ? 1.9 : day === 29 ? 1.45 : 1.25
  if (y === 2025 && m === 11 && day === 1) l *= 1.5
  return l
}

/** The board's two weeks, spread over their days. */
const WEEK = {
  now: {
    refunds: weekRefunds(),
    exchanges: spread(BLOCKS.retourcijfers.figures[2].value, ORD.current),
    delivered: spread(1096, ORD.current),
    late: spread(BLOCKS.bezorging.figures[1].value, ORD.current),
    agents: spread(BLOCKS.klantenservice.figures[3].value, TIX.map((x) => x.value))
  },
  before: {
    refunds: spread(BLOCKS.retourcijfers.figures[0].previous, ORD.compare),
    exchanges: spread(BLOCKS.retourcijfers.figures[2].previous, ORD.compare),
    delivered: spread(1076, ORD.compare),
    late: spread(BLOCKS.bezorging.figures[1].previous, ORD.compare),
    agents: spread(BLOCKS.klantenservice.figures[3].previous, TIX.map((x) => x.compare))
  }
}

/** The categories of the two weeks, dealt so each week's counts are the board's. */
const DEALT = {
  now: {
    // The Aurora refunds are the Aurora's; the other fifteen are dealt over the other products.
    products: deal(SHARE.products.now.slice(1), 11).map((c) => c + 1),
    carriers: deal(SHARE.carriers.now, 12),
    suppliers: deal(SHARE.late.now, 13),
    countries: deal(SHARE.countries.now, 14)
  },
  before: {
    products: deal(SHARE.products.before, 21),
    reasons: deal(SHARE.reasons.before, 22),
    carriers: deal(SHARE.carriers.before, 23),
    suppliers: deal(SHARE.late.before, 24),
    countries: deal(SHARE.countries.before, 25)
  }
}

const REASON_KEY: ReadonlyArray<string> = ["te-klein", "niet-zoals-foto", "te-groot", "anders", "beschadigd"]

/** The week's 41 refunds, each with the day it was paid back and what it is counted under. */
const WEEK_REFUNDS: ReadonlyArray<Refund & { readonly day: number }> = (() => {
  let other = 0
  return WEEK.now.refunds.map((r, k) => ({
    day: dayIndex(new Date(r.resolution?.at ?? DEMO_NOW.date.getTime())),
    product: r.productId === NAMED[0] ? 0 : DEALT.now.products[other++] ?? REST,
    reason: Math.max(0, REASON_KEY.indexOf(r.reason)),
    carrier: DEALT.now.carriers[k] ?? 0,
    order: r.orderNumber
  }))
})()

const days = new Map<number, Day>()

function dayOf(i: number): Day {
  const hit = days.get(i)
  if (hit !== undefined) return hit
  const made = makeDay(i)
  days.set(i, made)
  return made
}

const offsetIn = (i: number, start: number) => i - start
/** How many of a week's spread values fall before day `k`, to read the dealt list from there. */
const before = (xs: ReadonlyArray<number>, k: number) => sum(xs.slice(0, k))

function makeDay(i: number): Day {
  const wd = weekday(i)
  if (i < 0 || i > NOW) {
    return {
      revenue: 0,
      orders: 0,
      tickets: 0,
      reply: 0,
      solved: 0,
      agents: 0,
      delivered: 0,
      lead: 0,
      exchanges: 0,
      refundEuro: 0,
      refunds: [],
      late: [],
      disputes: []
    }
  }
  const disputes: ReadonlyArray<Dispute> = i >= DISPUTES_FROM
    ? CHARGEBACKS.filter((c) => dayIndex(new Date(c.openedAt)) === i).map((c) => ({
      reason: DISPUTE_REASONS.indexOf(c.reason),
      id: c.id,
      order: c.orderNumber,
      amount: c.amount
    }))
    : noise(i, 9) < 0.11
    ? [{ reason: pick([3, 2, 2, 1, 1, 1], noise(i, 10)), amount: 40 + Math.round(noise(i, 11) * 120) }]
    : []

  if (i === NOW) {
    return {
      revenue: TODAY.revenue,
      orders: TODAY.orders,
      tickets: Math.round(TIX[0].value * PART),
      reply: TODAY.firstReply,
      solved: 86,
      agents: Math.round(WEEK.now.agents[0]! * PART),
      delivered: Math.round(WEEK.now.delivered[0]! * PART),
      lead: 4.4,
      exchanges: 0,
      refundEuro: 0,
      refunds: [],
      late: [],
      disputes
    }
  }

  if (i >= W0) {
    const k = offsetIn(i, W0)
    const refunds = WEEK_REFUNDS.filter((r) => r.day === i)
    const late = WEEK.now.late[k] ?? 0
    const lateFrom = before(WEEK.now.late, k)
    return {
      revenue: REV.current[k] ?? 0,
      orders: ORD.current[k] ?? 0,
      tickets: TIX[wd]?.value ?? 0,
      reply: BLOCKS.kerncijfers.figures[3].value,
      solved: BLOCKS.klantenservice.figures[2].value,
      agents: WEEK.now.agents[k] ?? 0,
      delivered: WEEK.now.delivered[k] ?? 0,
      lead: BLOCKS.bezorging.figures[2].value,
      exchanges: WEEK.now.exchanges[k] ?? 0,
      refundEuro: (BLOCKS.retourcijfers.figures[3].value * refunds.length) / WEEK_REFUNDS.length,
      refunds,
      late: Array.from({ length: late }, (_, j) => ({
        supplier: DEALT.now.suppliers[lateFrom + j] ?? 1,
        country: DEALT.now.countries[lateFrom + j] ?? 0,
        days: 1 + Math.floor(noise(i * 131 + j, 31) * 3)
      })),
      disputes
    }
  }

  if (i >= W1) {
    const k = offsetIn(i, W1)
    const n = WEEK.before.refunds[k] ?? 0
    const from = before(WEEK.before.refunds, k)
    const late = WEEK.before.late[k] ?? 0
    const lateFrom = before(WEEK.before.late, k)
    return {
      revenue: REV.compare[k] ?? 0,
      orders: ORD.compare[k] ?? 0,
      tickets: TIX[wd]?.compare ?? 0,
      reply: BLOCKS.kerncijfers.figures[3].previous,
      solved: BLOCKS.klantenservice.figures[2].previous,
      agents: WEEK.before.agents[k] ?? 0,
      delivered: WEEK.before.delivered[k] ?? 0,
      lead: BLOCKS.bezorging.figures[2].previous,
      exchanges: WEEK.before.exchanges[k] ?? 0,
      refundEuro: (BLOCKS.retourcijfers.figures[3].previous * n) / BLOCKS.retourcijfers.figures[0].previous,
      refunds: Array.from({ length: n }, (_, j) => ({
        product: DEALT.before.products[from + j] ?? REST,
        reason: DEALT.before.reasons[from + j] ?? 0,
        carrier: DEALT.before.carriers[from + j] ?? 0
      })),
      late: Array.from({ length: late }, (_, j) => ({
        supplier: DEALT.before.suppliers[lateFrom + j] ?? 1,
        country: DEALT.before.countries[lateFrom + j] ?? 0,
        days: 1 + Math.floor(noise(i * 131 + j, 31) * 3)
      })),
      disputes
    }
  }

  // The shop's history: the week before the board's, scaled by how busy the day was.
  const revenue = Math.round(BASE * level(i) * ((REV.compare[wd] ?? BASE) / BASE) * (0.92 + 0.16 * noise(i, 1)))
  const orders = Math.max(1, Math.round(revenue / (38.2 + 1.6 * noise(i, 2))))
  const growth = Math.min(1, i / W1)
  const tickets = Math.round(
    orders * (307 / 1152) * ((TIX[wd]?.compare ?? 44) / (307 / 7)) / ((ORD.compare[wd] ?? 165) / (1152 / 7))
  )
  const refundN = Math.round(orders * (0.021 + 0.01 * noise(i, 3)))
  const delivered = Math.round(orders * 0.93)
  const lateN = Math.round(delivered * (0.05 + 0.025 * noise(i, 4)))
  // Agents answer from September 2026.
  const agentsFrom = dayIndex(new Date(2026, 8, 1))
  return {
    revenue,
    orders,
    tickets,
    reply: 19 + 9 * (1 - growth) + 3 * noise(i, 5),
    solved: 74 + 5 * noise(i, 6),
    agents: i >= agentsFrom ? Math.round(tickets * (0.22 + 0.06 * noise(i, 7))) : 0,
    delivered,
    lead: 4.1 + 0.4 * noise(i, 8),
    exchanges: Math.round(refundN * 0.3 * noise(i, 12) * 2),
    refundEuro: refundN * (68 + 8 * noise(i, 13)),
    refunds: Array.from({ length: refundN }, (_, j) => ({
      product: pick(SHARE.products.before, noise(i * 53 + j, 41)),
      reason: pick(SHARE.reasons.before, noise(i * 53 + j, 42)),
      carrier: pick(SHARE.carriers.before, noise(i * 53 + j, 43))
    })),
    late: Array.from({ length: lateN }, (_, j) => ({
      supplier: pick(SHARE.late.before, noise(i * 59 + j, 44)),
      country: pick(SHARE.countries.before, noise(i * 59 + j, 45)),
      days: 1 + Math.floor(noise(i * 131 + j, 31) * 3)
    })),
    disputes
  }
}

/* ── a span of days ────────────────────────────────────────────────────────────────────────────── */

/** Days `from` to `to`, both counted; `part` is the one day counted only until 14:30 (against today). */
type Span = { readonly from: number; readonly to: number; readonly part?: number }

const lengthOf = (s: Span) => s.to - s.from + 1

function* each(s: Span): Generator<{ readonly i: number; readonly d: Day; readonly f: number }> {
  for (let i = Math.max(s.from, 0); i <= Math.min(s.to, NOW); i++) yield { i, d: dayOf(i), f: i === s.part ? PART : 1 }
}

/** The part of a day's list a span counts: all of it, or what came in until 14:30. */
const share = <T>(xs: ReadonlyArray<T>, f: number) => (f === 1 ? xs : xs.slice(0, Math.round(xs.length * f)))

type Agg = {
  readonly revenue: number
  readonly orders: number
  readonly tickets: number
  readonly reply: number
  readonly solved: number
  readonly agents: number
  readonly delivered: number
  readonly lead: number
  readonly exchanges: number
  readonly refundEuro: number
  readonly refunds: number
  readonly late: number
  readonly disputes: number
  readonly byProduct: ReadonlyArray<number>
  readonly byReason: ReadonlyArray<number>
  readonly byCarrier: ReadonlyArray<number>
  readonly lateBySupplier: ReadonlyArray<number>
  readonly lateByCountry: ReadonlyArray<number>
  readonly leadBySupplier: ReadonlyArray<number>
  readonly ticketsByWeekday: ReadonlyArray<number>
  readonly byStore: ReadonlyArray<number>
  readonly byPayment: ReadonlyArray<number>
  readonly disputesByReason: ReadonlyArray<number>
  readonly sold: ReadonlyArray<number>
  readonly funnel: ReadonlyArray<number>
}

const aggs = new Map<string, Agg>()

const count = (n: number, xs: ReadonlyArray<number>) => {
  const out = Array.from({ length: n }, () => 0)
  for (const x of xs) out[x] = (out[x] ?? 0) + 1
  return out
}

function agg(s: Span): Agg {
  const key = `${s.from}:${s.to}:${s.part ?? ""}`
  const hit = aggs.get(key)
  if (hit !== undefined) return hit
  const list = [...each(s)]
  const total = (get: (d: Day) => number) => sum(list.map(({ d, f }) => get(d) * f))
  const mean = (get: (d: Day) => number, weight: (d: Day) => number) => {
    const w = total(weight)
    return w === 0 ? 0 : sum(list.map(({ d, f }) => get(d) * weight(d) * f)) / w
  }
  const refunds = list.flatMap(({ d, f }) => share(d.refunds, f))
  const late = list.flatMap(({ d, f }) => share(d.late, f))
  const disputes = list.flatMap(({ d }) => d.disputes)
  const orders = Math.round(total((d) => d.orders))
  const delivered = total((d) => d.delivered)
  const out: Agg = {
    revenue: Math.round(total((d) => d.revenue)),
    orders,
    tickets: Math.round(total((d) => d.tickets)),
    reply: Math.round(mean((d) => d.reply, (d) => d.tickets)),
    solved: Math.round(mean((d) => d.solved, (d) => d.tickets) * 10) / 10,
    agents: Math.round(total((d) => d.agents)),
    delivered: Math.round(delivered),
    lead: Math.round(mean((d) => d.lead, (d) => d.delivered) * 10) / 10,
    exchanges: Math.round(total((d) => d.exchanges)),
    refundEuro: Math.round(total((d) => d.refundEuro)),
    refunds: refunds.length,
    late: late.length,
    disputes: disputes.length,
    byProduct: count(REST + 1, refunds.map((r) => r.product)),
    byReason: count(REASONS.length, refunds.map((r) => r.reason)),
    byCarrier: count(CARRIERS.length, refunds.map((r) => r.carrier)),
    lateBySupplier: count(SUPPLIERS.length, late.map((r) => r.supplier)),
    lateByCountry: count(COUNTRIES.length, late.map((r) => r.country)),
    leadBySupplier: SUPPLIERS.map((_, k) => {
      const w = sum(list.map(({ d, f }) => d.delivered * f))
      if (w === 0) return 0
      const v = sum(list.map(({ i, d, f }) => {
        const base = SHARE.lead[era(i)][k] ?? 4
        const week = Math.floor(i / 7)
        // Kestrel slipped over the autumn: on time in the summer, past its promise for three weeks now.
        const slip = k === 1 && i < W1 ? 0.82 + 0.18 * Math.min(1, Math.max(0, (i - (W1 - 63)) / 42)) : 1
        const drift = i >= W1 ? 1 : slip * (1 + 0.12 * (noise(week, 60 + k) - 0.5))
        return base * drift * d.delivered * f
      }))
      return Math.round((v / w) * 10) / 10
    }),
    ticketsByWeekday: WEEK_DAYS.map((_, w) =>
      Math.round(sum(list.filter(({ i }) => weekday(i) === w).map(({ d, f }) => d.tickets * f)))
    ),
    byStore: whole(storeShare.map((c) => (orders * c) / sum(storeShare))),
    byPayment: whole(paymentShare.map((c) => (orders * c) / sum(paymentShare))),
    disputesByReason: count(DISPUTE_REASONS.length, disputes.map((d) => d.reason)),
    sold: NAMED.map((_, k) =>
      Math.round(
        sum(list.map(({ i, d, f }) => d.orders * f * (SHARE.sold[era(i)][k] ?? 0) / (era(i) === "now" ? 1204 : 1152)))
      )
    ),
    funnel: [0, 1, 2, 3].map((k) =>
      Math.round(sum(list.map(({ i, d, f }) => d.orders * f * (SHARE.funnel[era(i)][k] ?? 0))))
    )
  }
  aggs.set(key, out)
  return out
}

/* ── the period a board reads ──────────────────────────────────────────────────────────────────── */

export type Ctx = {
  readonly cur: Span
  readonly cmp: Span | null
  readonly compare: Compare
  /** "16–22 nov"; with the year when it is not this year's. */
  readonly label: string
  /** "9–15 nov", "17–23 nov 2025"; empty when the board does not compare. */
  readonly cmpLabel: string
  /** The board's own week against the week before, as the board was written: its notes hold. */
  readonly standard: boolean
  /** Northwind sold nothing yet in this period. */
  readonly empty: boolean
}

const labelOf = (s: Span) => {
  const from = dateAt(s.from)
  const to = dateAt(s.to)
  const text = formatRange({ from, to })
  return to.getFullYear() === DEMO_NOW.date.getFullYear() ? text : `${text} ${to.getFullYear()}`
}

export function contextOf(p: Period): Ctx {
  const to = Math.min(dayIndex(p.range.to), NOW)
  const from = Math.min(dayIndex(p.range.from), to)
  const shift = p.compare === "jaar" ? 364 : to - from + 1
  const cmp: Span | null = p.compare === "geen"
    ? null
    : { from: from - shift, to: to - shift, ...(to === NOW ? { part: to - shift } : {}) }
  const cur: Span = { from, to }
  return {
    cur,
    cmp,
    compare: p.compare,
    label: labelOf(cur),
    cmpLabel: cmp === null ? "" : labelOf(cmp),
    standard: from === W0 && to === W0 + 6 && p.compare === "periode",
    empty: to < 0
  }
}

/** Every refund, late parcel and dispute of a span, one by one, for the orders behind a figure. */
export function eventsOf(s: Span) {
  const list = [...each(s)]
  return {
    refunds: list.flatMap(({ i, d, f }) => share(d.refunds, f).map((r) => ({ ...r, i }))),
    late: list.flatMap(({ i, d, f }) => share(d.late, f).map((r) => ({ ...r, i }))),
    disputes: list.flatMap(({ i, d }) => d.disputes.map((r) => ({ ...r, i })))
  }
}

export { agg, dateAt, dayOf, lengthOf, weekday }
export type { Agg, Span }
export const CATS = {
  reasons: REASONS,
  carriers: CARRIERS,
  countries: COUNTRIES,
  suppliers: SUPPLIERS,
  products: NAMED,
  productLabel: [...PRODUCT_LABEL, "Boulevard", "Harbor", "Overig"],
  stores: STORES.map((s) => STORE_NAME[s]),
  payments: PAYMENTS,
  disputes: DISPUTE_REASONS
} as const
export { NOW, W0 }

/* ── the blocks, for the period ────────────────────────────────────────────────────────────────── */

const n = (v: number) => v.toLocaleString("nl-NL")
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`
const MONTH = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const
export const shortDate = (i: number) => {
  const d = dateAt(i)
  return `${d.getDate()} ${MONTH[d.getMonth()]}`
}

/** The points of a line over the period: days up to a month, weeks beyond. */
export function bucketsOf(s: Span): ReadonlyArray<Span> {
  const len = lengthOf(s)
  const size = len > 31 ? 7 : 1
  return Array.from({ length: Math.ceil(len / size) }, (_, k) => {
    const from = s.from + k * size
    const to = Math.min(s.to, from + size - 1)
    return { from, to, ...(s.part !== undefined && s.part >= from && s.part <= to ? { part: s.part } : {}) }
  })
}

const bucketLabel = (b: Span, all: ReadonlyArray<Span>) =>
  all.length <= 7 && lengthOf(b) === 1 ? (WEEK_DAYS[weekday(b.from)] ?? "").slice(0, 2) : shortDate(b.from)

function line(ctx: Ctx, get: (a: Agg) => number, format: "euro" | "count") {
  const cur = bucketsOf(ctx.cur)
  const cmp = ctx.cmp === null ? null : bucketsOf(ctx.cmp)
  const current = cur.map((b) => get(agg(b)))
  return {
    labels: cur.map((b) => bucketLabel(b, cur)),
    current,
    ...(cmp === null ? {} : { compare: cur.map((_, k) => (cmp[k] === undefined ? 0 : get(agg(cmp[k])))) }),
    format,
    focus: current.indexOf(Math.max(...current))
  }
}

const bars = (labels: ReadonlyArray<string>, a: ReadonlyArray<number>, b: ReadonlyArray<number> | null) =>
  labels.map((label, k) => ({ label, value: a[k] ?? 0, ...(b === null ? {} : { compare: b[k] ?? 0 }) }))

const argmax = (xs: ReadonlyArray<number>) => xs.indexOf(Math.max(...xs))

/** Refunds per product as the board draws them: four named and the rest together. */
const byProductShown = (xs: ReadonlyArray<number>) => [...xs.slice(0, 4), sum(xs.slice(4))]

const fig = (
  label: string,
  value: number,
  previous: number | undefined,
  format: "euro" | "count" | "percent" | "minutes" | "days",
  better: "higher" | "lower"
) => ({ label, value, previous: previous ?? value, format, better })

const rate = (part: number, of: number) => (of === 0 ? 0 : Math.round((part / of) * 1000) / 10)

/** "57% meer" or "12% minder". */
const againstBefore = (change: number) => `${Math.abs(Math.round(change * 100))}% ${change >= 0 ? "meer" : "minder"}`

const blockCache = new Map<string, Readonly<Record<BlockId, Block>>>()

/**
 * Every block for the period, the same questions in the same forms. The board's own week reads the
 * fixtures as written, notes and all; any other period is counted from its days, and Magnus's note
 * on a block says what stands out in that period.
 */
export function blocksOf(ctx: Ctx): Readonly<Record<BlockId, Block>> {
  if (ctx.standard) return BLOCKS
  const key = `${ctx.cur.from}:${ctx.cur.to}:${ctx.compare}`
  const hit = blockCache.get(key)
  if (hit !== undefined) return hit
  const A = agg(ctx.cur)
  const B = ctx.cmp === null ? null : agg(ctx.cmp)
  const p = <K extends keyof Agg>(k: K) => (B === null ? undefined : B[k])
  const omzet = line(ctx, (a) => a.revenue, "euro")
  const orders = line(ctx, (a) => a.orders, "count")
  const best = omzet.focus
  const bestBefore = omzet.compare?.[best]
  const products = byProductShown(A.byProduct)
  const top = argmax(products)
  const tz = argmax(A.lateByCountry)
  const slow = argmax(A.leadBySupplier)
  const busy = argmax(A.ticketsByWeekday)
  const klarna = PAYMENTS.indexOf("Klarna")
  const disputeItems = bars(DISPUTE_REASONS, A.disputesByReason, B?.disputesByReason ?? null).filter((x) =>
    x.value > 0 || (x.compare ?? 0) > 0
  )
  const out = {
    kerncijfers: {
      ...BLOCKS.kerncijfers,
      title: lengthOf(ctx.cur) === 7 ? BLOCKS.kerncijfers.title : "Hoe ging het?",
      source: `Shopify en Inbox · ${plural(A.orders, "bestelling", "bestellingen")}, ${
        plural(A.tickets, "ticket", "tickets")
      }`,
      figures: [
        fig("Omzet", A.revenue, p("revenue"), "euro", "higher"),
        fig("Bestellingen", A.orders, p("orders"), "count", "higher"),
        fig("Terugbetalingen", A.refunds, p("refunds"), "count", "lower"),
        fig("Eerste reactie", A.reply, p("reply"), "minutes", "lower")
      ]
    },
    retourcijfers: {
      ...BLOCKS.retourcijfers,
      source: `Shopify · ${plural(A.refunds, "terugbetaling", "terugbetalingen")}, ${
        plural(A.exchanges, "omruiling", "omruilingen")
      }`,
      figures: [
        fig("Terugbetalingen", A.refunds, p("refunds"), "count", "lower"),
        fig(
          "Retourpercentage",
          rate(A.refunds, A.orders),
          B === null ? undefined : rate(B.refunds, B.orders),
          "percent",
          "lower"
        ),
        fig("Omruilingen", A.exchanges, p("exchanges"), "count", "higher"),
        fig("Terugbetaald", A.refundEuro, p("refundEuro"), "euro", "lower")
      ]
    },
    omzetPerDag: {
      id: "omzetPerDag",
      kind: "line",
      title: lengthOf(ctx.cur) > 31 ? "Omzet per week" : "Omzet per dag",
      source: "Shopify · betaalde bestellingen, excl. btw",
      ...(omzet.current.length > 1
        ? {
          note: {
            text: `${
              lengthOf(ctx.cur) > 31
                ? `De week van ${shortDate(bucketsOf(ctx.cur)[best]?.from ?? 0)}`
                : cap(`${WEEK_DAYS[weekday(ctx.cur.from + best)]} ${shortDate(ctx.cur.from + best)}`)
            } was de ${lengthOf(ctx.cur) > 31 ? "beste week" : "beste dag"}: ${
              omzet.current[best]?.toLocaleString("nl-NL", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0
              })
            }${
              bestBefore === undefined || bestBefore === 0
                ? ""
                : `, ${againstBefore((omzet.current[best] ?? 0) / bestBefore - 1)} dan dezelfde ${
                  lengthOf(ctx.cur) > 31 ? "week" : "dag"
                } ${ctx.compare === "jaar" ? "vorig jaar" : "in de periode ervoor"}`
            }.`,
            at: best
          }
        }
        : {}),
      data: omzet
    },
    bestellingenPerDag: {
      id: "bestellingenPerDag",
      kind: "line",
      title: lengthOf(ctx.cur) > 31 ? "Bestellingen per week" : "Bestellingen per dag",
      source: `Shopify · ${plural(A.orders, "bestelling", "bestellingen")}`,
      data: orders
    },
    retourredenen: {
      id: "retourredenen",
      kind: "rank",
      title: BLOCKS.retourredenen.title,
      source: `Retourformulieren · ${plural(A.refunds, "reden", "redenen")}`,
      ...(A.refunds > 0
        ? {
          note: {
            text: `${REASONS[argmax(A.byReason)]}: ${n(Math.max(...A.byReason))} van de ${n(A.refunds)}.`,
            at: argmax(A.byReason)
          }
        }
        : {}),
      data: { items: bars(REASONS, A.byReason, B?.byReason ?? null), format: "count", focus: argmax(A.byReason) }
    },
    terugbetalingenPerProduct: {
      id: "terugbetalingenPerProduct",
      kind: "bar",
      title: BLOCKS.terugbetalingenPerProduct.title,
      source: `Shopify · ${plural(A.refunds, "terugbetaling", "terugbetalingen")}`,
      ...(A.refunds > 0 && top < 4
        ? {
          note: {
            text: `${n(products[top] ?? 0)} van de ${n(A.refunds)} terugbetalingen gaan over de ${
              product(NAMED[top] ?? "")?.name ?? ""
            }.`,
            at: top
          }
        }
        : {}),
      data: {
        items: bars(
          CATS.productLabel.slice(0, 4).concat("Overig"),
          products,
          B === null ? null : byProductShown(B.byProduct)
        ),
        format: "count",
        focus: top
      }
    },
    conversie: {
      ...BLOCKS.conversie,
      source: `Shopify-sessies · ${plural(A.funnel[0] ?? 0, "bezoek", "bezoeken")}`,
      data: {
        steps: [
          ...BLOCKS.conversie.data.steps.slice(0, 4).map((s, k) => ({ label: s.label, value: A.funnel[k] ?? 0 })),
          {
            label: "Betaald",
            value: A.orders
          }
        ]
      }
    },
    retourPerProduct: {
      ...BLOCKS.retourPerProduct,
      source: `Shopify · verkocht en terugbetaald, ${ctx.label}`,
      data: {
        columns: B === null
          ? BLOCKS.retourPerProduct.data.columns.map((c) =>
            c.key === "rate" ? { key: "rate", label: "Retour", format: "percent" as const } : c
          )
          : BLOCKS.retourPerProduct.data.columns,
        rows: NAMED.map((id, k) => ({
          product: product(id)?.name ?? id,
          sold: A.sold[k] ?? 0,
          returned: A.byProduct[k] ?? 0,
          rate: rate(A.byProduct[k] ?? 0, A.sold[k] ?? 0),
          ...(B === null ? {} : { ratePrev: rate(B.byProduct[k] ?? 0, B.sold[k] ?? 0) })
        })),
        focus: argmax(NAMED.map((_, k) => rate(A.byProduct[k] ?? 0, A.sold[k] ?? 0)))
      }
    },
    levertijd: {
      id: "levertijd",
      kind: "bar",
      title: BLOCKS.levertijd.title,
      source: `Track & trace · ${plural(A.delivered, "bezorgd pakket", "bezorgde pakketten")}`,
      ...((A.leadBySupplier[slow] ?? 0) > 5
        ? {
          note: {
            text: `${supplier(SUPPLIERS[slow]?.id ?? "")?.name ?? ""} doet er gemiddeld ${
              (A.leadBySupplier[slow] ?? 0).toLocaleString("nl-NL")
            } dagen over; de belofte is 5.`,
            at: slow
          }
        }
        : {}),
      data: {
        items: bars(SUPPLIERS.map((s) => s.label), A.leadBySupplier, B?.leadBySupplier ?? null),
        format: "days",
        focus: slow,
        reference: BLOCKS.levertijd.data.reference
      }
    },
    perVervoerder: {
      ...BLOCKS.perVervoerder,
      source: `Shopify en track & trace · ${plural(A.refunds, "terugbetaling", "terugbetalingen")}`,
      data: { items: bars(CARRIERS, A.byCarrier, B?.byCarrier ?? null), format: "count" }
    },
    bezorging: {
      ...BLOCKS.bezorging,
      source: `Track & trace · pakketten van ${ctx.label}`,
      figures: [
        fig(
          "Op tijd bezorgd",
          100 - rate(A.late, A.delivered),
          B === null ? undefined : 100 - rate(B.late, B.delivered),
          "percent",
          "higher"
        ),
        fig("Te laat", A.late, p("late"), "count", "lower"),
        fig("Gem. levertijd", A.lead, p("lead"), "days", "lower"),
        fig(
          ctx.cur.to >= W0 + 6 ? "Nu vertraagd" : "Vertraagd",
          delayedAt(ctx.cur),
          ctx.cmp === null ? undefined : delayedAt(ctx.cmp),
          "count",
          "lower"
        )
      ]
    },
    teLaatPerLand: {
      id: "teLaatPerLand",
      kind: "rank",
      title: BLOCKS.teLaatPerLand.title,
      source: `Track & trace · ${plural(A.late, "te laat pakket", "te late pakketten")}`,
      ...(A.late > 0
        ? {
          note: {
            text: `${COUNTRIES[tz]}: ${n(A.lateByCountry[tz] ?? 0)} van de ${n(A.late)} te late pakketten.`,
            at: tz
          }
        }
        : {}),
      data: { items: bars(COUNTRIES, A.lateByCountry, B?.lateByCountry ?? null), format: "count", focus: tz }
    },
    geschillenPerReden: {
      id: "geschillenPerReden",
      kind: "rank",
      title: BLOCKS.geschillenPerReden.title,
      source: `Klarna, Stripe en PayPal · ${plural(A.disputes, "geschil", "geschillen")} geopend`,
      data: {
        items: disputeItems.length > 0
          ? disputeItems
          : bars(DISPUTE_REASONS.slice(0, 3), [0, 0, 0], B === null ? null : [0, 0, 0]),
        format: "count"
      }
    },
    ticketsPerDag: {
      id: "ticketsPerDag",
      kind: "bar",
      title: BLOCKS.ticketsPerDag.title,
      source: `Inbox · ${plural(A.tickets, "ticket", "tickets")}`,
      ...(A.tickets > 0
        ? {
          note: {
            text: `${cap(WEEK_DAYS[busy] ?? "")} bracht ${
              Math.round(((A.ticketsByWeekday[busy] ?? 0) / A.tickets) * 100)
            }% van de vragen.`,
            at: busy
          }
        }
        : {}),
      data: {
        items: bars(WEEK_DAYS.map((d) => d.slice(0, 2)), A.ticketsByWeekday, B?.ticketsByWeekday ?? null),
        format: "count",
        focus: busy
      }
    },
    klantenservice: {
      ...BLOCKS.klantenservice,
      source: `Inbox · ${plural(A.tickets, "ticket", "tickets")}`,
      figures: [
        fig("Tickets", A.tickets, p("tickets"), "count", "lower"),
        fig("Eerste reactie", A.reply, p("reply"), "minutes", "lower"),
        fig("Binnen een dag opgelost", A.solved, p("solved"), "percent", "higher"),
        fig("Door agents afgehandeld", A.agents, p("agents"), "count", "higher")
      ]
    },
    perWinkel: {
      ...BLOCKS.perWinkel,
      source: `Shopify · ${plural(A.orders, "bestelling", "bestellingen")}`,
      data: { items: bars(CATS.stores, A.byStore, B?.byStore ?? null), format: "count", focus: 0 }
    },
    betaalmethode: {
      id: "betaalmethode",
      kind: "rank",
      title: BLOCKS.betaalmethode.title,
      source: `Shopify · ${plural(A.orders, "bestelling", "bestellingen")}`,
      data: { items: bars(PAYMENTS, A.byPayment, B?.byPayment ?? null), format: "count", focus: klarna }
    }
  } satisfies Record<BlockId, Block>
  blockCache.set(key, out)
  return out
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Parcels still on their way past their promised day at the end of a span: today's eight, else the week's late share. */
function delayedAt(s: Span): number {
  if (s.to >= W0 + 6) return BLOCKS.bezorging.figures[3].value
  if (s.to >= W1 + 6) return BLOCKS.bezorging.figures[3].previous
  return Math.round(agg({ from: Math.max(0, s.to - 6), to: s.to }).late * 0.075)
}
