import { describe, expect, it } from "vitest"
import { ok, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The daily facts (step 12.4, M10.4). Rows go in through the Shopify mirror's own writer; the triggers mark the days
 * they touch; draining recomputes those days from the rows. Draining after every change must leave exactly what a
 * rebuild from scratch leaves, and both must equal the live sums (widgets/02 §0.1). Days are the store's: an order at
 * 23:30 in New York is that day's, not the next. A refund weeks later lands on its own day in the refunds facts, and
 * takes the order out of its placed day's revenue.
 */

type Facts = {
  orders: Array<
    {
      storeId: string
      day: string
      currency: string
      orders: number
      paidOrders: number
      countedOrders: number
      countedRevenueMinor: number
      units: number
      revenueMinor: number
      refunds: number
      refundedMinor: number
      cancelled: number
    }
  >
  refunds: Array<{ storeId: string; day: string; currency: string; refunds: number; amountMinor: number }>
  deliveries: Array<
    {
      storeId: string
      day: string
      parcels: number
      onTime: number
      late: number
      daysLateSum: number
      tookDaysSum: number
    }
  >
  marked: Array<{ storeId: string; day: string }>
  live: Array<{ storeId: string; day: string; currency: string; countedOrders: number; countedRevenueMinor: number }>
  liveRefunds: Array<{ storeId: string; day: string; currency: string; refunds: number; amountMinor: number }>
}

const factsOf = async (workspace: string) =>
  await (await call(`http://api.test/api/__dev/facts?workspace=${workspace}`)).json() as Facts

const drain = async (workspace: string, nightly = false) =>
  await (await call(`http://api.test/api/__dev/facts/drain?workspace=${workspace}${nightly ? "&nightly=1" : ""}`, {
    method: "POST"
  })).json() as { marked: number; drained: number }

const rebuild = (workspace: string) =>
  call(`http://api.test/api/__dev/facts/rebuild?workspace=${workspace}`, { method: "POST" })

const write = async (workspace: string, store: string, body: unknown) => {
  const response = await call(`http://api.test/api/__dev/facts/orders?workspace=${workspace}&store=${store}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
  expect(response.status).toBe(200)
}

/** A mirror page's order row, paid, in EUR. */
const order = (id: string, placedAt: string, totalMinor: number, change: Record<string, unknown> = {}) => ({
  shopify_id: `gid://shopify/Order/${id}`,
  number: `#F${id}`,
  customer_shopify_id: null,
  customer_name: "Klant F",
  customer_email: null,
  status: "paid",
  payment_status: "paid",
  fulfillment_status: "unfulfilled",
  total_minor: totalMinor,
  subtotal_minor: totalMinor,
  shipping_minor: 0,
  tax_minor: 0,
  discounts_minor: 0,
  currency: "EUR",
  payment_gateway: null,
  card_last4: null,
  shipping_address: { country: "NL" },
  tags: [],
  note: null,
  channel: "web",
  referral_code: null,
  placed_at: placedAt,
  paid_at: placedAt,
  shipped_at: null,
  cancelled_at: null,
  refunded_at: null,
  external_updated_at: placedAt,
  raw: {},
  ...change
})

const line = (id: string, orderId: string, quantity: number, unitPriceMinor: number) => ({
  shopify_id: `gid://shopify/LineItem/${id}`,
  order_shopify_id: `gid://shopify/Order/${orderId}`,
  product_shopify_id: null,
  variant_shopify_id: null,
  sku: null,
  title: `Artikel ${id}`,
  variant_title: null,
  quantity,
  unit_price_minor: unitPriceMinor
})

const seeded = async (tag: string) => {
  const owner = await person(`facts-${tag}`, `Facts ${tag} B.V.`)
  const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
  const seed = await call("http://api.test/api/__dev/stores/seed", {
    method: "POST",
    headers: { cookie: owner.cookie }
  })
  const { storeId } = await seed.json() as { storeId: string }
  return { ...owner, workspace, storeId }
}

/** The facts without the marks, for comparing two ways of reaching them. */
const stored = (facts: Facts) => ({ orders: facts.orders, refunds: facts.refunds, deliveries: facts.deliveries })

/** Per store-day sums of the orders facts, as the live sums are shaped. */
const counted = (facts: Facts) => {
  const days = new Map<string, Facts["live"][number]>()
  for (const f of facts.orders) {
    const key = `${f.storeId}|${f.day}|${f.currency}`
    const at = days.get(key) ??
      { storeId: f.storeId, day: f.day, currency: f.currency, countedOrders: 0, countedRevenueMinor: 0 }
    days.set(key, {
      ...at,
      countedOrders: at.countedOrders + f.countedOrders,
      countedRevenueMinor: at.countedRevenueMinor + f.countedRevenueMinor
    })
  }
  return [...days.values()].filter((d) => d.countedOrders > 0).toSorted((a, b) =>
    `${a.storeId}|${a.day}|${a.currency}`.localeCompare(`${b.storeId}|${b.day}|${b.currency}`)
  )
}

const refunded = (facts: Facts) => {
  const days = new Map<string, Facts["liveRefunds"][number]>()
  for (const f of facts.refunds) {
    const key = `${f.storeId}|${f.day}|${f.currency}`
    const at = days.get(key) ?? { storeId: f.storeId, day: f.day, currency: f.currency, refunds: 0, amountMinor: 0 }
    days.set(key, { ...at, refunds: at.refunds + f.refunds, amountMinor: at.amountMinor + f.amountMinor })
  }
  return [...days.values()].toSorted((a, b) =>
    `${a.storeId}|${a.day}|${a.currency}`.localeCompare(`${b.storeId}|${b.day}|${b.currency}`)
  )
}

/** This run's Shopify ids, so a rerun against the same database writes new orders. */
const id = (n: number) => `${run}${n}`

const day = (facts: Facts, d: string) => facts.orders.filter((f) => f.day === d)
const sum = <T>(rows: Array<T>, f: (row: T) => number) => rows.reduce((total, row) => total + f(row), 0)

describe("the daily facts", () => {
  it("keeps each day from the rows, by the store's day, as a rebuild from scratch would", async () => {
    const store = await seeded("days")
    // The recorded store's own orders, drained once its timezone is New York's.
    await write(store.workspace, store.storeId, { timezone: "America/New_York" })
    await drain(store.workspace)

    // 23:30 on 9 March in New York (03:30 UTC on the 10th): that store's 9 March. Two lines share its 100,01.
    await write(store.workspace, store.storeId, {
      batch: {
        orders: [
          order(id(1), "2026-03-10T03:30:00Z", 10001),
          order(id(2), "2026-03-10T15:00:00Z", 4995),
          order(id(3), "2026-03-10T16:00:00Z", 2500, { status: "cancelled", cancelled_at: "2026-03-10T17:00:00Z" })
        ],
        lines: [line(id(11), id(1), 1, 3333), line(id(12), id(1), 2, 3333), line(id(21), id(2), 1, 4995)]
      }
    })
    expect((await factsOf(store.workspace)).marked.map((m) => m.day)).toEqual(["2026-03-09", "2026-03-10"])
    await drain(store.workspace)
    let facts = await factsOf(store.workspace)
    expect(facts.marked).toEqual([])
    expect(day(facts, "2026-03-09")).toEqual([
      expect.objectContaining({
        orders: 1,
        countedOrders: 1,
        countedRevenueMinor: 10001,
        units: 3,
        revenueMinor: 10001
      })
    ])
    expect(day(facts, "2026-03-10")).toEqual([
      expect.objectContaining({ orders: 2, paidOrders: 2, countedOrders: 1, countedRevenueMinor: 4995, cancelled: 1 })
    ])

    // Delivered on 14 March, promised for the 12th: two days late, five days from the order.
    await write(store.workspace, store.storeId, {
      batch: {
        orders: [
          order(id(1), "2026-03-10T03:30:00Z", 10001, {
            status: "delivered",
            fulfillment_status: "fulfilled",
            external_updated_at: "2026-03-14T18:00:00Z"
          })
        ],
        fulfilments: [{
          shopify_id: `gid://shopify/Fulfillment/${id(1)}`,
          order_shopify_id: `gid://shopify/Order/${id(1)}`,
          status: "success",
          carrier: "PostNL",
          tracking_number: `3S${id(1)}`,
          tracking_url: null,
          shipped_at: "2026-03-11T12:00:00Z",
          delivered_at: "2026-03-14T16:00:00Z",
          tracking_status: "delivered"
        }]
      },
      promised: { [`gid://shopify/Order/${id(1)}`]: "2026-03-12T20:00:00Z" }
    })
    await drain(store.workspace)
    facts = await factsOf(store.workspace)
    expect(facts.deliveries.filter((d) => d.day === "2026-03-14")).toEqual([
      expect.objectContaining({ parcels: 1, onTime: 0, late: 1, daysLateSum: 2, tookDaysSum: 5 })
    ])

    // Refunded in full on 1 April: the refund is April's; the order leaves 10 March's revenue.
    await write(store.workspace, store.storeId, {
      batch: {
        orders: [
          order(id(2), "2026-03-10T15:00:00Z", 4995, {
            status: "refunded",
            payment_status: "refunded",
            refunded_at: "2026-04-01T12:00:00Z",
            external_updated_at: "2026-04-01T12:00:00Z"
          })
        ],
        refunds: [{
          shopify_id: `gid://shopify/Refund/${id(2)}`,
          order_shopify_id: `gid://shopify/Order/${id(2)}`,
          amount_minor: 4995,
          currency: "EUR",
          note: null,
          created_at: "2026-04-01T12:00:00Z"
        }]
      }
    })
    expect((await factsOf(store.workspace)).marked.map((m) => m.day)).toEqual(["2026-03-10", "2026-04-01"])
    await drain(store.workspace)
    facts = await factsOf(store.workspace)
    expect(day(facts, "2026-03-10")).toEqual([
      expect.objectContaining({ orders: 2, countedOrders: 0, countedRevenueMinor: 0, refunds: 1, refundedMinor: 4995 })
    ])
    expect(facts.refunds.filter((r) => r.day === "2026-04-01")).toEqual([
      expect.objectContaining({ refunds: 1, amountMinor: 4995, currency: "EUR" })
    ])
    expect(facts.refunds.filter((r) => r.day === "2026-03-10")).toEqual([])

    // The same rows rebuilt from nothing give the same facts, and the facts give the live sums.
    const incremental = stored(facts)
    expect((await rebuild(store.workspace)).status).toBe(200)
    const rebuilt = await factsOf(store.workspace)
    expect(stored(rebuilt)).toEqual(incremental)
    expect(counted(rebuilt)).toEqual(rebuilt.live)
    expect(refunded(rebuilt)).toEqual(rebuilt.liveRefunds)
    expect(sum(rebuilt.orders, (o) => o.orders)).toBeGreaterThan(3)
  })

  it("drains what a change marked through the relay, and marks the last three days at night", async () => {
    const store = await seeded("relay")
    // The seed's rows marked their days; a tag change in Insyte is an order's change, so the relay drains them.
    expect((await factsOf(store.workspace)).marked.length).toBeGreaterThan(0)
    const [first] = ok(await rpc("Orders.list", { limit: 5 }, store.cookie)).rows
    ok(await rpc("Orders.tag", { ids: [first!.id], add: ["feiten"], remove: [] }, store.cookie))
    await relay(store.workspace)
    let facts = await factsOf(store.workspace)
    expect(facts.marked).toEqual([])
    expect(counted(facts)).toEqual(facts.live)

    // The nightly pass marks today and the two days before for the store, and drains them.
    const night = await drain(store.workspace, true)
    expect(night.marked).toBe(3)
    expect(night.drained).toBe(3)
    facts = await factsOf(store.workspace)
    expect(facts.marked).toEqual([])
    expect(counted(facts)).toEqual(facts.live)
  })
})
