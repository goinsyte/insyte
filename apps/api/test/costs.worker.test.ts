import { addMonths, figuresOf, type LineRule } from "@insyte/modules/costs/domain/Figures"
import { describe, expect, it } from "vitest"
import { failure, ok, person, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Kosten (M13 step 5): lines are made, typed, changed and removed, each with its undo; the month figures are the facts'
 * counted revenue and orders against the lines, as the pure calculation (`costs/domain/Figures.ts`) says; an ad line
 * reads from its account only while one is connected; the daily sync reads nothing where no provider is configured;
 * and `/v1/costs` and MCP's `get_costs` answer the same for a key with `analytics.read`.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

type FactRow = { day: string; countedOrders: number; countedRevenueMinor: number; currency: string }

const seeded = async (tag: string) => {
  const owner = await person(`costs-${tag}`, `Kosten ${tag} B.V.`)
  const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
  const seed = await call("http://api.test/api/__dev/stores/seed", {
    method: "POST",
    headers: { cookie: owner.cookie }
  })
  const { storeId } = await seed.json() as { storeId: string }
  return { ...owner, workspace, storeId }
}

const order = (id: string, placedAt: string, totalMinor: number) => ({
  shopify_id: `gid://shopify/Order/${id}`,
  number: `#K${id}`,
  customer_shopify_id: null,
  customer_name: "Klant K",
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
  raw: {}
})

const writeOrders = async (workspace: string, store: string, orders: Array<unknown>) => {
  const response = await call(`http://api.test/api/__dev/facts/orders?workspace=${workspace}&store=${store}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ batch: { orders } })
  })
  expect(response.status).toBe(200)
  await call(`http://api.test/api/__dev/facts/drain?workspace=${workspace}`, { method: "POST" })
}

/** Counted revenue and orders per month, from the stored facts. */
const factsByMonth = async (workspace: string) => {
  const facts = await (await call(`http://api.test/api/__dev/facts?workspace=${workspace}`)).json() as {
    orders: Array<FactRow>
  }
  const months = new Map<string, { revenueMinor: number; orders: number }>()
  for (const f of facts.orders) {
    expect(f.currency).toBe("EUR")
    const m = f.day.slice(0, 7)
    const at = months.get(m) ?? { revenueMinor: 0, orders: 0 }
    months.set(m, { revenueMinor: at.revenueMinor + f.countedRevenueMinor, orders: at.orders + f.countedOrders })
  }
  return months
}

const tag = (n: number) => `${run}${n}`

/** A `/v1` call with a bearer key. */
const v1 = async (path: string, token: string) => {
  const response = await call(`http://api.public.test/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: response.status, body: await response.json() as Json }
}

describe("Kosten", () => {
  it("turns the facts' revenue into net profit, line by line, with an undo for every change", async () => {
    const shop = await seeded("lines")
    let list = ok(await rpc("Costs.list", {}, shop.cookie))
    const current = list.current
    const previous = addMonths(current, -1)
    expect(list.months).toEqual([4, 3, 2, 1, 0].map((n) => addMonths(current, -n)))
    expect(list.lines).toEqual([])
    expect(list.currency).toBe("EUR")

    // An hour ago (this month, in the store's time, unless the month turned in that hour) and the middle of the last.
    const now = new Date(Date.now() - 3_600_000).toISOString()
    await writeOrders(shop.workspace, shop.storeId, [
      order(tag(1), now, 25_000),
      order(tag(2), now, 15_050),
      order(tag(3), `${previous}-15T12:00:00Z`, 40_000)
    ])
    const facts = await factsByMonth(shop.workspace)

    const fixed = ok(
      await rpc("Costs.create", { name: "  Team  ", kind: "fixed", amountPerMonthMinor: 1_000_000 }, shop.cookie)
    )
    ok(await rpc("Costs.create", { name: "Inkoop", kind: "percent", rate: 38 }, shop.cookie))
    ok(await rpc("Costs.create", { name: "Verpakking", kind: "per_order", rateMinor: 140 }, shop.cookie))
    const meta = ok(
      await rpc(
        "Costs.create",
        { name: "Meta Ads", kind: "ads", source: "meta", amountPerMonthMinor: 5_000 },
        shop.cookie
      )
    )
    expect(fixed.undo).not.toBeNull()

    list = ok(await rpc("Costs.list", {}, shop.cookie))
    expect(list.lines.map((l) => [l.name, l.kind])).toEqual([
      ["Team", "fixed"],
      ["Inkoop", "percent"],
      ["Verpakking", "per_order"],
      ["Meta Ads", "ads"]
    ])
    const metaLine = list.lines.find((l) => l.id === meta.id)!
    // No account is connected: the line is typed, and says it does not read.
    expect(metaLine).toMatchObject({ source: "meta", readsFromSource: false, hasTyped: true })
    expect(metaLine.cells[current]).toEqual({ amountMinor: 5_000, typed: true, source: "typed" })

    // The figures are the pure calculation over the facts.
    const rules: Array<LineRule> = [
      {
        kind: "fixed",
        rate: null,
        rateMinor: null,
        typed: new Map(list.months.map((m) => [m, 1_000_000])),
        account: null
      },
      { kind: "percent", rate: 38, rateMinor: null, typed: new Map(), account: null },
      { kind: "per_order", rate: null, rateMinor: 140, typed: new Map(), account: null },
      { kind: "ads", rate: null, rateMinor: null, typed: new Map(list.months.map((m) => [m, 5_000])), account: null }
    ]
    for (const m of [previous, current]) {
      const basis = facts.get(m) ?? { revenueMinor: 0, orders: 0 }
      expect(basis.revenueMinor).toBeGreaterThan(0)
      expect(list.figures.find((f) => f.month === m)).toEqual(figuresOf(rules, m, basis))
    }
    const f = list.figures.find((x) => x.month === current)!
    const basis = facts.get(current)!
    expect(f.otherMinor).toBe(1_000_000 + Math.round(0.38 * basis.revenueMinor) + 140 * basis.orders)
    expect(f.netMinor).toBe(basis.revenueMinor - f.costsMinor)
    expect(f.roas).toBeCloseTo(basis.revenueMinor / 5_000)

    // A month typed, then undone; cleared; a worked-out line and a future month refused.
    const typed = ok(
      await rpc("Costs.setAmount", { lineId: fixed.id, month: current, amountMinor: 1_200_000 }, shop.cookie)
    )
    const cell = async () =>
      ok(await rpc("Costs.list", {}, shop.cookie)).lines.find((l) => l.id === fixed.id)!.cells[current]
    expect(await cell()).toEqual({ amountMinor: 1_200_000, typed: true, source: "typed" })
    ok(await rpc("Shared.undo", { token: typed.undo!.token }, shop.cookie))
    expect((await cell())!.amountMinor).toBe(1_000_000)
    const same = ok(
      await rpc("Costs.setAmount", { lineId: fixed.id, month: current, amountMinor: 1_000_000 }, shop.cookie)
    )
    expect(same.undo).toBeNull()
    ok(await rpc("Costs.setAmount", { lineId: fixed.id, month: current, amountMinor: null }, shop.cookie))
    expect(await cell()).toEqual({ amountMinor: 0, typed: false, source: "none" })
    const percent = list.lines.find((l) => l.kind === "percent")!
    expect(failure(await rpc("Costs.setAmount", { lineId: percent.id, month: current, amountMinor: 1 }, shop.cookie)))
      .toMatchObject({ _tag: "NotEditable" })
    expect(
      failure(
        await rpc("Costs.setAmount", { lineId: fixed.id, month: addMonths(current, 1), amountMinor: 1 }, shop.cookie)
      )
    ).toMatchObject({ _tag: "MonthOutOfRange" })
    expect(failure(await rpc("Costs.setAmount", { lineId: fixed.id, month: current, amountMinor: -1 }, shop.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { amount: "negative" } })

    // The dialog's checks, on the fields they belong to; a typed line cannot become a worked-out one.
    expect(failure(await rpc("Costs.create", { name: " ", kind: "percent", rate: 120 }, shop.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { name: "required", rate: "range" } })
    expect(failure(await rpc("Costs.update", { id: fixed.id, name: "Team", kind: "percent", rate: 5 }, shop.cookie)))
      .toMatchObject({ _tag: "KindChangeNotAllowed" })
    const renamed = ok(await rpc("Costs.update", { id: fixed.id, name: "Het team", kind: "fixed" }, shop.cookie))
    ok(await rpc("Shared.undo", { token: renamed.undo!.token }, shop.cookie))

    // Removed with its months, and back with them.
    const removed = ok(await rpc("Costs.remove", { id: fixed.id }, shop.cookie))
    expect(ok(await rpc("Costs.list", {}, shop.cookie)).lines.map((l) => l.id)).not.toContain(fixed.id)
    ok(await rpc("Shared.undo", { token: removed.undo!.token }, shop.cookie))
    const back = ok(await rpc("Costs.list", {}, shop.cookie)).lines.find((l) => l.id === fixed.id)!
    expect(back).toMatchObject({ name: "Team", kind: "fixed", hasTyped: true })
    expect(back.cells[previous]!.amountMinor).toBe(1_000_000)
    // A new line's undo takes it away.
    const made = ok(await rpc("Costs.create", { name: "Apps", kind: "fixed" }, shop.cookie))
    ok(await rpc("Shared.undo", { token: made.undo!.token }, shop.cookie))
    expect(ok(await rpc("Costs.list", {}, shop.cookie)).lines.map((l) => l.name)).not.toContain("Apps")

    // `Costs.figures` serves the same months.
    const figures = ok(await rpc("Costs.figures", { months: [current, previous] }, shop.cookie))
    expect(figures.figures.map((x) => x.month)).toEqual([previous, current])
  }, 120_000)

  it("reads an ad line from its account while it is connected, and the sync reads nothing without a provider", async () => {
    const shop = await seeded("ads")
    const { current } = ok(await rpc("Costs.list", {}, shop.cookie))
    const previous = addMonths(current, -1)
    const meta = ok(await rpc("Costs.create", { name: "Meta Ads", kind: "ads", source: "meta" }, shop.cookie))
    const google = ok(
      await rpc(
        "Costs.create",
        { name: "Google Ads", kind: "ads", source: "google_ads", amountPerMonthMinor: 900 },
        shop.cookie
      )
    )
    // Only the Meta line has an account; Google stays typed.
    await call(`http://api.test/api/__dev/costs/ad-account?workspace=${shop.workspace}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "meta",
        spend: [
          { day: `${current}-01`, spendMinor: 1_234 },
          { day: `${previous}-10`, spendMinor: 2_000 },
          { day: `${previous}-11`, spendMinor: 500 }
        ]
      })
    })
    ok(await rpc("Costs.setAmount", { lineId: meta.id, month: previous, amountMinor: 9_999 }, shop.cookie))
    let lines = ok(await rpc("Costs.list", {}, shop.cookie)).lines
    let line = lines.find((l) => l.id === meta.id)!
    expect(line).toMatchObject({ readsFromSource: true, hasTyped: true })
    expect(line.cells[current]).toEqual({ amountMinor: 1_234, typed: false, source: "account" })
    expect(line.cells[previous]).toEqual({ amountMinor: 9_999, typed: true, source: "typed" })
    expect(lines.find((l) => l.id === google.id)).toMatchObject({ readsFromSource: false })

    // "Weer uit Meta Ads lezen": the typed month goes, the account's spend shows, and the undo brings it back.
    const reread = ok(await rpc("Costs.readFromSource", { id: meta.id }, shop.cookie))
    line = ok(await rpc("Costs.list", {}, shop.cookie)).lines.find((l) => l.id === meta.id)!
    expect(line.cells[previous]).toEqual({ amountMinor: 2_500, typed: false, source: "account" })
    expect(line.hasTyped).toBe(false)
    ok(await rpc("Shared.undo", { token: reread.undo!.token }, shop.cookie))
    lines = ok(await rpc("Costs.list", {}, shop.cookie)).lines
    expect(lines.find((l) => l.id === meta.id)!.cells[previous]!.amountMinor).toBe(9_999)

    // The daily sync: no provider is configured here, so it writes nothing and the account's days stay.
    const sync = await (await call("http://api.test/api/__dev/costs/sync", { method: "POST" })).json() as {
      written: number
    }
    expect(sync.written).toBe(0)
    line = ok(await rpc("Costs.list", {}, shop.cookie)).lines.find((l) => l.id === meta.id)!
    expect(line.cells[current]!.amountMinor).toBe(1_234)
  })

  it("answers /v1/costs and get_costs for a key with analytics.read, and refuses one without", async () => {
    const shop = await seeded("api")
    ok(await rpc("Costs.create", { name: "Shopify", kind: "fixed", amountPerMonthMinor: 39_900 }, shop.cookie))
    const make = async (label: string, access: unknown) =>
      ok(
        await rpc("ApiKeys.create", {
          label,
          access: access as never,
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent: false
        }, shop.cookie)
      ).secret
    const reader = await make("Analyse", { kind: "custom", scopes: { analytics: 1 } })
    const orders = await make("Alleen bestellingen", { kind: "custom", scopes: { orders: 1 } })
    const costs = await v1("/costs", reader)
    expect(costs.status).toBe(200)
    expect(costs.body.lines).toEqual([
      expect.objectContaining({ name: "Shopify", kind: "fixed", reads_from_source: false })
    ])
    expect(costs.body.lines[0].months).toHaveLength(5)
    expect(costs.body.figures.at(-1)).toMatchObject({ month: costs.body.current, costs_minor: 39_900 })
    const figures = await v1(`/costs/figures?months=${costs.body.current}`, reader)
    expect(figures.body.data).toEqual([expect.objectContaining({ month: costs.body.current, costs_minor: 39_900 })])
    expect((await v1("/costs/figures?months=mei", reader)).status).toBe(400)
    const refused = await v1("/costs", orders)
    expect(refused.status).toBe(403)
    expect(refused.body.error).toMatchObject({ code: "ScopeMissingV1", scope: "analytics.read" })
  })
})
