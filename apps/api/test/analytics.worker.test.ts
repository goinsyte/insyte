import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Analyse (step 16.2, M14 step 2). Orders go in through the Shopify mirror's writer and the facts are drained; the six
 * figures, the charts, the findings and the drawer then read them. Every figure is measured as what this run's rows
 * added, since the seeded store brings orders of its own. The rows the drawer lists are the rows the figure counts;
 * an order in a currency without a rate is left out of the money and said so; a ticket counts on the day it came in,
 * through `fact_tickets_day`; a dispute on the day it was opened, through `fact_disputes_day`, a store's only for the
 * members who may see that store; a month that has not begun is refused. INSYTE()'s figures answer over `/v1` and MCP.
 */

const pad = (n: number) => String(n).padStart(2, "0")
const now = new Date()
const month = (back: number) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}
/** The month under way and the one before, in the workspace's (Amsterdam) time; the first is noon on the 1st. */
const A = month(0)
const B = month(1)
const at = (m: string, hour = 10) => `${m}-01T${pad(hour)}:00:00Z`

const id = (n: number) => `${run}${n}`

const order = (n: number, placedAt: string, totalMinor: number, change: Record<string, unknown> = {}) => ({
  shopify_id: `gid://shopify/Order/${id(n)}`,
  number: `#A${id(n)}`,
  customer_shopify_id: null,
  customer_name: "Klant A",
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
  shipping_address: { country: "DE" },
  tags: [],
  note: null,
  channel: "analyse",
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

const write = async (workspace: string, store: string, body: unknown) => {
  const response = await call(`http://api.test/api/__dev/facts/orders?workspace=${workspace}&store=${store}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
  expect(response.status).toBe(200)
}

const drain = (workspace: string) =>
  call(`http://api.test/api/__dev/facts/drain?workspace=${workspace}`, { method: "POST" })

type Figure = { id: string; a: number | null; b: number | null; available: boolean; basis: { a: number; b: number } }
const figure = (figures: ReadonlyArray<Figure>, name: string) => figures.find((f) => f.id === name)!

describe("Analyse", () => {
  it("reads the six figures, the charts, the findings and the rows behind them from the facts", async () => {
    const owner = await person("analytics", "Analyse B.V.")
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const seed = await call("http://api.test/api/__dev/stores/seed", {
      method: "POST",
      headers: { cookie: owner.cookie }
    })
    const { storeId } = await seed.json() as { storeId: string }
    await write(workspace, storeId, { timezone: "Europe/Amsterdam" })
    await drain(workspace)

    const pair = { a: A, b: B }
    const periods = ok(await rpc("Analytics.periods", undefined, owner.cookie))
    expect(periods.current).toBe(A)
    expect(periods.months.at(-1)).toMatchObject({ month: A, inProgress: true })
    const before = ok(await rpc("Analytics.overview", pair, owner.cookie))
    const chartsBefore = ok(await rpc("Analytics.charts", pair, owner.cookie))

    // In A: two paid orders (one delivered two days late against its promise), one cancelled, one in dollars with no
    // rate; in B: one paid order, refunded in A.
    await write(workspace, storeId, {
      batch: {
        orders: [
          order(1, at(A), 12000, { status: "delivered", fulfillment_status: "fulfilled" }),
          order(2, at(A, 11), 8000),
          order(3, at(A, 12), 5000, { status: "cancelled", cancelled_at: at(A, 13) }),
          order(4, at(A, 13), 3000, { currency: "USD" }),
          order(5, at(B), 4000, {
            status: "refunded",
            payment_status: "refunded",
            refunded_at: at(A, 14),
            external_updated_at: at(A, 14)
          })
        ],
        lines: [1, 2, 3, 4, 5].map((n) => ({
          shopify_id: `gid://shopify/LineItem/${id(n)}`,
          order_shopify_id: `gid://shopify/Order/${id(n)}`,
          product_shopify_id: null,
          variant_shopify_id: null,
          sku: null,
          title: `Artikel ${n}`,
          variant_title: null,
          quantity: 1,
          unit_price_minor: 1000
        })),
        fulfilments: [{
          shopify_id: `gid://shopify/Fulfillment/${id(1)}`,
          order_shopify_id: `gid://shopify/Order/${id(1)}`,
          status: "success",
          carrier: "DHL",
          tracking_number: `JD${id(1)}`,
          tracking_url: null,
          shipped_at: at(A, 12),
          delivered_at: at(A, 20),
          tracking_status: "delivered"
        }],
        refunds: [{
          shopify_id: `gid://shopify/Refund/${id(5)}`,
          order_shopify_id: `gid://shopify/Order/${id(5)}`,
          amount_minor: 4000,
          currency: "EUR",
          note: null,
          created_at: at(A, 14)
        }]
      },
      // Promised for the day before it was placed: delivered late.
      promised: { [`gid://shopify/Order/${id(1)}`]: `${B}-25T12:00:00Z` }
    })
    expect((await drain(workspace)).status).toBe(200)

    // A ticket that came in now and is done: one more ticket in A, with its hours.
    const ticket = ok(await rpc("Tickets.create", { title: "Waar blijft mijn pakket?" }, owner.cookie))
    ok(await rpc("Tickets.setStatus", { ids: [ticket.tickets[0]!.id], status: "done" }, owner.cookie))

    const after = ok(await rpc("Analytics.overview", pair, owner.cookie))
    expect(after.A).toMatchObject({ month: A, from: `${A}-01`, inProgress: true })
    expect(after.B.days).toBe(after.A.days)
    const delta = (name: string, side: "a" | "b") =>
      (figure(after.figures, name)[side] ?? 0) - (figure(before.figures, name)[side] ?? 0)
    // The dollar order counts as an order, but its money waits for a rate.
    expect(delta("revenue", "a")).toBe(20000)
    expect(delta("paid_orders", "a")).toBe(3)
    // The refunded order leaves B's revenue: it never counted.
    expect(delta("revenue", "b")).toBe(0)
    expect(figure(after.figures, "paid_orders").basis.a - figure(before.figures, "paid_orders").basis.a).toBe(3)
    expect(figure(after.figures, "on_time").basis.a - figure(before.figures, "on_time").basis.a).toBe(1)
    expect(figure(after.figures, "refund_rate").basis.b - figure(before.figures, "refund_rate").basis.b).toBe(1)
    expect(figure(after.figures, "disputes")).toMatchObject({ available: true })
    expect(figure(after.figures, "resolve_hours").basis.a - figure(before.figures, "resolve_hours").basis.a).toBe(1)
    expect(after.unconverted).toBeGreaterThan(before.unconverted)
    expect(after.basis.orders - before.basis.orders).toBe(5)
    expect(after.basis.tickets - before.basis.tickets).toBe(1)

    // The charts: day 1 holds A's two orders in euros; the refund lands on A, its own day; the late order is a dot past
    // the promise.
    const charts = ok(await rpc("Analytics.charts", pair, owner.cookie))
    const day1 = (c: typeof charts) => c.daily.find((d) => d.day === 1)!
    expect((day1(charts).a ?? 0) - (day1(chartsBefore).a ?? 0)).toBe(20000)
    const refunds = (c: typeof charts) => c.refundReasons.find((r) => r.reason === null)?.a ?? 0
    expect(refunds(charts) - refunds(chartsBefore)).toBe(1)
    expect(Array.isArray(charts.disputeReasons)).toBe(true)
    expect(charts.supportByWeekday).toHaveLength(7)
    const dots = charts.leadTimes.flatMap((r) => r.dots)
    expect(dots.some((d) => d.daysLate > 0)).toBe(true)

    // Betaalde bestellingen, taken apart: the rows are the orders it counts, newest first, a page at a time.
    const paid = ok(await rpc("Analytics.explain", { ...pair, key: { _tag: "paid_orders" } }, owner.cookie))
    expect(paid.a).toBe(figure(after.figures, "paid_orders").a)
    expect(paid.recordCount).toBe(figure(after.figures, "paid_orders").basis.a)
    const page = ok(
      await rpc("Analytics.records", { explainKey: { ...pair, key: { _tag: "paid_orders" } } }, owner.cookie)
    )
    const numbers = page.rows.map((r) => r.number)
    expect(numbers).toEqual(expect.arrayContaining([`#A${id(1)}`, `#A${id(2)}`]))
    expect(numbers).not.toContain(`#A${id(3)}`)
    expect(page.rows.find((r) => r.number === `#A${id(1)}`)).toMatchObject({ outcome: "late", country: "DE" })

    // The refund's rows: the order placed in B, refunded in A.
    const refunded = ok(
      await rpc(
        "Analytics.records",
        { explainKey: { ...pair, key: { _tag: "refund_reason", reason: null } } },
        owner.cookie
      )
    )
    expect(refunded.rows.find((r) => r.number === `#A${id(5)}`)).toMatchObject({ outcome: "refunded" })

    // The findings: each with its weight, heaviest first, and its rows counted.
    const found = ok(await rpc("Analytics.findings", pair, owner.cookie))
    expect(found.findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["revenue", "refunds", "support"]))
    const weights = found.findings.map((f) => f.weight)
    expect(weights).toEqual(weights.toSorted((x, y) => y - x))

    // The same overview over `/v1`, as a key that reads Analyse.
    const key = ok(
      await rpc("ApiKeys.create", {
        label: "Analyse",
        access: { kind: "custom", scopes: { analytics: 1 } },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, owner.cookie)
    ).secret
    const rest = await call(`http://api.test/v1/analytics/overview?a=${A}&b=${B}`, {
      headers: { authorization: `Bearer ${key}` }
    })
    expect(rest.status).toBe(200)
    const body = await rest.json() as { figures: Array<{ id: string; a: number | null }> }
    expect(body.figures.find((f) => f.id === "revenue")?.a).toBe(figure(after.figures, "revenue").a)

    // A month that has not begun is refused.
    const later = await rpc("Analytics.overview", { a: month(-2), b: A }, owner.cookie)
    expect(later._tag).toBe("Failure")
  })

  it("counts disputes by the day opened, explains them down to their orders, and fences them by store", async () => {
    const owner = await person("analytics-disputes", "Geschillen B.V.")
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const seed = await call("http://api.test/api/__dev/stores/seed", {
      method: "POST",
      headers: { cookie: owner.cookie }
    })
    const { storeId } = await seed.json() as { storeId: string }
    // Order 21 arrived five days past its promise; order 22 is on its way.
    await write(workspace, storeId, {
      timezone: "Europe/Amsterdam",
      batch: {
        orders: [
          order(21, at(A), 6000, { status: "delivered", fulfillment_status: "fulfilled" }),
          order(22, at(A, 11), 4000)
        ],
        fulfilments: [{
          shopify_id: `gid://shopify/Fulfillment/${id(21)}`,
          order_shopify_id: `gid://shopify/Order/${id(21)}`,
          status: "success",
          carrier: "DHL",
          tracking_number: `JD${id(21)}`,
          tracking_url: null,
          shipped_at: at(A, 12),
          delivered_at: at(A, 20),
          tracking_status: "delivered"
        }]
      },
      promised: { [`gid://shopify/Order/${id(21)}`]: `${B}-25T12:00:00Z` }
    })
    await drain(workspace)
    const pair = { a: A, b: B }
    const paid = ok(
      await rpc("Analytics.records", { explainKey: { ...pair, key: { _tag: "paid_orders" } } }, owner.cookie)
    )
    const orderId = (n: number) => paid.rows.find((r) => r.number === `#A${id(n)}`)!.orderId
    const before = ok(await rpc("Analytics.overview", pair, owner.cookie))
    const chartsBefore = ok(await rpc("Analytics.charts", pair, owner.cookie))

    // In A: a store's "not received" about order 21, and one by hand without a store; in B: one about order 22.
    const cases = await call(`http://api.test/api/__dev/facts/disputes?workspace=${workspace}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        insert: [
          {
            caseNumber: `DSP-A${run}1`,
            storeId,
            orderId: orderId(21),
            openedAt: at(A, 12),
            reason: "item_not_received",
            amountMinor: 6000
          },
          { caseNumber: `DSP-A${run}2`, openedAt: at(A, 13), reason: "other", amountMinor: 2500 },
          {
            caseNumber: `DSP-A${run}3`,
            storeId,
            orderId: orderId(22),
            openedAt: at(B, 12),
            reason: "not_as_described",
            amountMinor: 4000
          }
        ]
      })
    })
    expect(cases.status).toBe(200)

    const after = ok(await rpc("Analytics.overview", pair, owner.cookie))
    const moved = (side: "a" | "b") =>
      (figure(after.figures, "disputes")[side] ?? 0) - (figure(before.figures, "disputes")[side] ?? 0)
    expect(moved("a")).toBe(2)
    expect(moved("b")).toBe(1)
    expect(figure(after.figures, "disputes")).toMatchObject({ available: true, basis: { a: after.figures[4]!.a } })

    const charts = ok(await rpc("Analytics.charts", pair, owner.cookie))
    const reason = (c: typeof charts, r: string, side: "a" | "b") =>
      c.disputeReasons.find((x) => x.reason === r)?.[side] ?? 0
    expect(reason(charts, "item_not_received", "a") - reason(chartsBefore, "item_not_received", "a")).toBe(1)
    expect(reason(charts, "other", "a") - reason(chartsBefore, "other", "a")).toBe(1)
    expect(reason(charts, "not_as_described", "b") - reason(chartsBefore, "not_as_described", "b")).toBe(1)

    // One reason taken apart: its cases, what they opened with, and the orders they name.
    const ref = { ...pair, key: { _tag: "dispute_reason" as const, reason: "item_not_received" } }
    const explained = ok(await rpc("Analytics.explain", ref, owner.cookie))
    expect(explained.a).toBeGreaterThanOrEqual(1)
    expect(explained.of).toBeGreaterThanOrEqual(6000)
    expect(explained.drivers.find((d) => d.key === storeId)).toMatchObject({ dim: "store" })
    const rows = ok(await rpc("Analytics.records", { explainKey: ref }, owner.cookie)).rows
    expect(rows.map((r) => r.number)).toContain(`#A${id(21)}`)
    expect(rows.map((r) => r.number)).not.toContain(`#A${id(22)}`)

    // The finding: counts, the reason that moved, and the late parcel behind "not received".
    const found = ok(await rpc("Analytics.findings", pair, owner.cookie)).findings.find((f) => f.kind === "disputes")
    expect(found).toMatchObject({ chart: "disputes", records: { _tag: "disputes" } })
    expect(found!.figures["notReceived"]).toBeGreaterThanOrEqual(1)
    expect(found!.figures["arrivedLate"]).toBeGreaterThanOrEqual(1)
    expect(found!.recordCount).toBeGreaterThanOrEqual(1)

    // A member held to another store sees the team's case only, and none of the store's orders.
    const made = ok(await rpc("Roles.create", { label: "Andere winkel", from: "view" }, owner.cookie))
    const role = made.roles.roles.find((r) => r.id === made.id)!
    ok(
      await rpc("Roles.update", {
        id: role.id,
        levels: role.levels,
        specials: role.specials,
        refundLimit: role.refundLimit,
        stores: ["store_elsewhere"]
      }, owner.cookie)
    )
    const email = `analytics-${run}-fenced@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: role.id, stores: "all" }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    const fenced = await join(email)
    const theirs = ok(await rpc("Analytics.overview", pair, fenced))
    expect(figure(theirs.figures, "disputes")).toMatchObject({ a: 1, b: 0 })
    const theirRows = ok(
      await rpc("Analytics.records", { explainKey: { ...pair, key: { _tag: "disputes" } } }, fenced)
    ).rows
    expect(theirRows).toEqual([])
    const theirFigures = ok(
      await rpc("Analytics.figures", { requests: [{ metric: "chargebacks", month: A }] }, fenced)
    ).figures[0]!
    expect(theirFigures).toMatchObject({ value: 25, rows: 1 })

    // INSYTE()'s figures over `/v1` and MCP, for a key that reads Analyse; refused to one that does not.
    const key = async (label: string, scopes: Record<string, 0 | 1 | 2>) =>
      ok(
        await rpc("ApiKeys.create", {
          label,
          access: { kind: "custom", scopes },
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent: false
        }, owner.cookie)
      ).secret
    const reader = await key("Cijfers", { analytics: 1 })
    const ordersOnly = await key("Alleen bestellingen", { orders: 1 })
    const v1 = async (path: string, token: string) => {
      const response = await call(`http://api.public.test/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
      return { status: response.status, body: await response.json() as Record<string, never> }
    }
    const owners = ok(
      await rpc("Analytics.figures", {
        requests: [{ metric: "chargebacks", month: A }, { metric: "nettowinst", month: A }]
      }, owner.cookie)
    )
    const rest = await v1(`/analytics/figures?metrics=chargebacks,nettowinst,omzet_meta&months=${A}`, reader)
    expect(rest.status).toBe(200)
    expect(rest.body).toMatchObject({
      currency: "EUR",
      current_month: A,
      figures: [
        { metric: "chargebacks", month: A, value: owners.figures[0]!.value, error: null },
        { metric: "nettowinst", month: A, value: owners.figures[1]!.value, error: null },
        { metric: "omzet_meta", month: A, value: null, error: "unavailable" }
      ]
    })
    expect((await v1("/analytics/figures?metrics=omzet&months=mei", reader)).status).toBe(400)
    const refused = await v1(`/analytics/figures?metrics=omzet`, ordersOnly)
    expect(refused.status).toBe(403)
    expect(refused.body["error"]).toMatchObject({ code: "ScopeMissingV1", scope: "analytics.read" })
    expect(failure(await rpc("Analytics.overview", { a: month(-2), b: A }, owner.cookie))).toMatchObject({
      _tag: "Invalid"
    })
  })
})
