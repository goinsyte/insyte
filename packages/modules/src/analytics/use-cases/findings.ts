import { type Driver, type Finding, splitKey } from "../domain/Analytics.ts"
import type { DeliveriesCell, OrdersCell, RefundsCell, TicketsCell } from "./reads.ts"
import { hoursOf, round1 } from "./reads.ts"

/*
 * The finding detectors (M14 step 2; widgets/02 "Finding traceability", the rules of the demo's
 * `lib/analytics/engine.ts`): each takes the two periods' fact sums and returns the movement worth reading, how much it
 * matters, and the rows that make it true, or nothing when there is nothing to read. Weights are in the workspace's
 * major units (a euro), as the demo ranks them. No sentence and no fixture story: the console writes the sentence per
 * kind; a proposal for it is M15's.
 */

const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100)
const sum = <T>(xs: ReadonlyArray<T>, f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0)
const avg = (xs: ReadonlyArray<number>) => (xs.length === 0 ? 0 : sum(xs, (x) => x) / xs.length)
const major = (minor: number) => minor / 100

/** Cells summed by a key. */
const group = <T>(cells: ReadonlyArray<T>, key: (c: T) => string, value: (c: T) => number) => {
  const g = new Map<string, number>()
  for (const c of cells) g.set(key(c), (g.get(key(c)) ?? 0) + value(c))
  return g
}

/** Both periods' keys, each with A, B and the change, largest change first (`by` picks the ordering). */
const moves = (ga: Map<string, number>, gb: Map<string, number>, by: "abs" | "up" = "abs") =>
  [...new Set([...ga.keys(), ...gb.keys()])]
    .map((k) => ({ k, a: ga.get(k) ?? 0, b: gb.get(k) ?? 0 }))
    .sort((x, y) => (by === "abs" ? Math.abs(y.a - y.b) - Math.abs(x.a - x.b) : y.a - y.b - (x.a - x.b)))

const enc = (...parts: ReadonlyArray<string | null>) => parts.map((p) => p ?? "").join("|")
/** A key in its parts, always as many as asked for. */
const dec = (k: string): readonly [string | null, string | null] => {
  const xs = splitKey(k)
  return [xs[0] ?? null, xs[1] ?? null]
}

export interface Names {
  readonly stores: ReadonlyMap<string, string>
  readonly products: ReadonlyMap<string, string>
  readonly suppliers: ReadonlyMap<string, string>
}

/** Omzet: the change, split into more or fewer orders and order size, and the product × store that moved it most. */
export const revenue = (
  a: ReadonlyArray<OrdersCell>,
  b: ReadonlyArray<OrdersCell>,
  names: Names
): Omit<Finding, "recordCount"> | undefined => {
  const revA = sum(a, (c) => c.revenue)
  const revB = sum(b, (c) => c.revenue)
  const nA = sum(a, (c) => c.counted)
  const nB = sum(b, (c) => c.counted)
  if (nA === 0 && nB === 0) return undefined
  const aovA = nA === 0 ? 0 : revA / nA
  const aovB = nB === 0 ? 0 : revB / nB
  const volume = Math.round((nA - nB) * aovB)
  const size = Math.round((aovA - aovB) * nA)
  const key = (c: OrdersCell) => enc(c.dims["product_id"] ?? null, c.dims["store_id"] ?? null)
  const ms = moves(group(a, key, (c) => c.revenue), group(b, key, (c) => c.revenue))
  const countsA = group(a, key, (c) => c.counted)
  const countsB = group(b, key, (c) => c.counted)
  const top = ms[0]
  const [productId, storeId] = top === undefined ? [null, null] : dec(top.k)
  const label = (k: string) => {
    const [p, s] = dec(k)
    return `${p === null ? "" : (names.products.get(p) ?? "")}|${s === null ? "" : (names.stores.get(s) ?? "")}`
  }
  const change = pct(revA, revB)
  return {
    kind: "revenue",
    tone: change >= 0 ? "good" : "bad",
    weight: major(Math.abs(revA - revB)),
    figures: {
      a: revA,
      b: revB,
      change,
      ordersA: nA,
      ordersB: nB,
      aovA: Math.round(aovA),
      aovB: Math.round(aovB),
      volume,
      size,
      topProduct: productId === null ? null : (names.products.get(productId) ?? null),
      topStore: storeId === null ? null : (names.stores.get(storeId) ?? null),
      topA: top?.a ?? 0,
      topB: top?.b ?? 0,
      topOrdersA: top === undefined ? 0 : (countsA.get(top.k) ?? 0),
      topOrdersB: top === undefined ? 0 : (countsB.get(top.k) ?? 0)
    },
    drivers: [
      { dim: "volume", key: "volume", name: null, a: nA, b: nB, n: null },
      { dim: "size", key: "size", name: null, a: Math.round(aovA), b: Math.round(aovB), n: null },
      ...ms.slice(0, 4).map((m): Driver => ({
        dim: "product_store",
        key: m.k,
        name: label(m.k),
        a: m.a,
        b: m.b,
        n: null
      }))
    ],
    chart: "revenue",
    lit: null,
    records: storeId === null ? null : { _tag: "product_store", productId, storeId }
  }
}

/** Levering op tijd: the change in points, and the supplier × country whose late deliveries grew most. */
export const delivery = (
  a: ReadonlyArray<DeliveriesCell>,
  b: ReadonlyArray<DeliveriesCell>,
  names: Names
): Omit<Finding, "recordCount"> | undefined => {
  const parcelsA = sum(a, (c) => c.parcels)
  const parcelsB = sum(b, (c) => c.parcels)
  if (parcelsA === 0 && parcelsB === 0) return undefined
  const onTime = (cells: ReadonlyArray<DeliveriesCell>, parcels: number) =>
    parcels === 0 ? 0 : round1((sum(cells, (c) => c.onTime) / parcels) * 100)
  const onTimeA = onTime(a, parcelsA)
  const onTimeB = onTime(b, parcelsB)
  const pts = round1(onTimeA - onTimeB)
  const key = (c: DeliveriesCell) => enc(c.dims["supplier_id"] ?? null, c.dims["country"] ?? null)
  const ms = moves(group(a, key, (c) => c.late), group(b, key, (c) => c.late), "up")
  const daysLate = group(a, key, (c) => c.daysLateSum)
  const top = ms[0]
  const [supplierId, country] = top === undefined ? [null, null] : dec(top.k)
  const grew = top !== undefined && top.a > top.b
  return {
    kind: "delivery",
    tone: pts >= 0 ? "good" : "bad",
    weight: Math.abs(pts) * 900 + (top === undefined ? 0 : (top.a - top.b) * 120),
    figures: {
      onTimeA,
      onTimeB,
      pts,
      delivered: parcelsA,
      late: sum(a, (c) => c.late),
      supplier: supplierId === null ? null : (names.suppliers.get(supplierId) ?? null),
      country,
      topA: grew ? top.a : 0,
      topB: grew ? top.b : 0,
      avgLate: grew && top.a > 0 ? round1((daysLate.get(top.k) ?? 0) / top.a) : 0
    },
    drivers: ms.slice(0, 5).map((m): Driver => {
      const [s] = dec(m.k)
      return {
        dim: "supplier_country",
        key: m.k,
        name: s === null ? null : (names.suppliers.get(s) ?? null),
        a: m.a,
        b: m.b,
        n: null
      }
    }),
    chart: "leadtime",
    lit: grew ? (supplierId ?? "") : null,
    records: grew ? { _tag: "supplier_country", supplierId, country } : null
  }
}

/** Terugbetalingen: the reason whose count changed most, and the product it changed on. */
export const refunds = (
  a: ReadonlyArray<RefundsCell>,
  b: ReadonlyArray<RefundsCell>,
  ordersA: ReadonlyArray<OrdersCell>,
  ordersB: ReadonlyArray<OrdersCell>,
  names: Names
): Omit<Finding, "recordCount"> | undefined => {
  if (a.length === 0 && b.length === 0) return undefined
  const key = (c: RefundsCell) => enc(c.reason)
  const ms = moves(group(a, key, (c) => c.refunds), group(b, key, (c) => c.refunds))
  const top = ms[0]!
  const [reason] = dec(top.k)
  const products = moves(
    group(a.filter((c) => key(c) === top.k), (c) => enc(c.productId), (c) => c.refunds),
    new Map()
  )
  const [productId] = products[0] === undefined ? [null, null] : dec(products[0].k)
  const n = products[0]?.a ?? 0
  const sold = productId === null ?
    0 :
    sum(ordersA.filter((c) => c.dims["product_id"] === productId), (c) => c.units)
  const rate = (cells: ReadonlyArray<OrdersCell>) => {
    const placed = sum(cells, (c) => c.orders)
    return placed === 0 ? 0 : (sum(cells, (c) => c.refunds) / placed) * 100
  }
  return {
    kind: "refunds",
    tone: top.a > top.b ? "bad" : "good",
    weight: Math.abs(top.a - top.b) * 140,
    figures: {
      reason,
      a: top.a,
      b: top.b,
      refundsA: sum(a, (c) => c.refunds),
      rateA: rate(ordersA),
      rateB: rate(ordersB),
      product: productId === null ? null : (names.products.get(productId) ?? null),
      productRefunds: n,
      sold
    },
    drivers: ms.slice(0, 5).map((m): Driver => ({
      dim: "refund_reason",
      key: m.k,
      name: null,
      a: m.a,
      b: m.b,
      n: null
    })),
    chart: "refunds",
    lit: top.k,
    records: { _tag: "refund_reason", reason }
  }
}

/** Klantenservice: tickets that came in at the weekend against those in the week, by hours to done. */
export const support = (
  a: ReadonlyArray<TicketsCell>,
  b: ReadonlyArray<TicketsCell>
): Omit<Finding, "recordCount"> | undefined => {
  const created = sum(a, (c) => c.created)
  if (created === 0) return undefined
  const resolveA = hoursOf(a) ?? 0
  const resolveB = hoursOf(b) ?? 0
  const byDay = [0, 1, 2, 3, 4, 5, 6].map((w) => {
    const cells = a.filter((c) => c.weekday === w)
    return { w, h: hoursOf(cells) ?? 0, n: sum(cells, (c) => c.created) }
  })
  const weekday = avg(byDay.filter((d) => d.w >= 1 && d.w <= 5).map((d) => d.h))
  const weekend = byDay.filter((d) => d.w === 0 || d.w === 6)
  const n = sum(weekend, (d) => d.n)
  const wk = sum(weekend, (d) => d.h * d.n) / Math.max(1, n)
  return {
    kind: "support",
    tone: wk > weekday * 1.8 || resolveA > resolveB ? "bad" : "good",
    weight: n * 18,
    figures: {
      weekend: round1(wk),
      weekday: round1(weekday),
      weekendTickets: n,
      tickets: created,
      resolveA,
      resolveB
    },
    drivers: [...byDay.slice(1), byDay[0]!].map((d): Driver => ({
      dim: "weekday",
      key: String(d.w),
      name: null,
      a: round1(d.h),
      b: resolveA,
      n: d.n
    })),
    chart: "support",
    lit: "6",
    records: null
  }
}

/** Groei: the channel that brought in the most more, and the store that grew fastest. */
export const growth = (
  a: ReadonlyArray<OrdersCell>,
  b: ReadonlyArray<OrdersCell>,
  names: Names
): Omit<Finding, "recordCount"> | undefined => {
  const channel = (c: OrdersCell) => enc(c.dims["channel"] ?? null)
  const store = (c: OrdersCell) => enc(c.dims["store_id"] ?? null)
  const channels = moves(group(a, channel, (c) => c.revenue), group(b, channel, (c) => c.revenue))
  const best = channels.sort((x, y) => y.a - y.b - (x.a - x.b))[0]
  if (best === undefined || best.a - best.b <= 0) return undefined
  const stores = moves(group(a, store, (c) => c.revenue), group(b, store, (c) => c.revenue))
    .sort((x, y) => pct(y.a, y.b) - pct(x.a, x.b))
  const bestStore = stores[0]
  const [channelKey] = dec(best.k)
  const [storeId] = bestStore === undefined ? [null, null] : dec(bestStore.k)
  return {
    kind: "growth",
    tone: "good",
    weight: major(best.a - best.b) * 0.6,
    figures: {
      channel: channelKey,
      a: best.a,
      b: best.b,
      store: storeId === null ? null : (names.stores.get(storeId) ?? null),
      storeA: bestStore?.a ?? 0,
      storeB: bestStore?.b ?? 0
    },
    drivers: channels.slice(0, 4).map((m): Driver => ({
      dim: "channel",
      key: m.k,
      name: null,
      a: m.a,
      b: m.b,
      n: null
    })),
    chart: "revenue",
    lit: null,
    records: { _tag: "channel", channel: channelKey }
  }
}
