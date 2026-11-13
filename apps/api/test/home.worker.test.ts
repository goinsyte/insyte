import { revenueIn, windowOf } from "@insyte/domain/Revenue"
import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc } from "./support.ts"

/*
 * Start's figures (step 12.3, M10.3), over the recorded twin's five orders (placed 1–5 October). The pulse and the
 * revenue widget sum the rows the shared definition counts (`@insyte/domain/Revenue`, widgets/02 §0.1): the SQL and the
 * definition, over the same orders, give one figure. A role without Analyse gets no money figures and no breakdown; a
 * workspace without orders is on its first day.
 */

const ALL = [
  "revenue",
  "orders",
  "chargebacks",
  "suppliers",
  "tickets",
  "mytickets",
  "stock",
  "returns",
  "live",
  "bestsellers",
  "countries"
] as const

const dayIn = (timeZone: string, at: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)

describe("Start's figures", () => {
  it("sums what the shared definition counts, and takes the revenue figure apart to the same total", async () => {
    const store = await importedStore("home")
    const orders = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows
    expect(orders.length).toBe(5)
    const today = dayIn("Europe/Amsterdam", Date.now())
    const rows = orders.map((o) => ({
      status: o.status,
      paymentStatus: o.paymentStatus,
      isDraft: false,
      totalMinor: o.totalMinor,
      placedDay: dayIn("Europe/Amsterdam", o.placedAt)
    }))
    const oracle = revenueIn(rows, windowOf(today, 90))
    expect(oracle.count).toBeGreaterThan(0)
    expect(oracle.count).toBeLessThan(5)

    const home = ok(await rpc("Home.widgets", { ids: [...ALL], range: 90 }, store.cookie))
    expect(home.currency).toBe("EUR")
    expect(home.pulse.revenue).toMatchObject({ value: oracle.totalMinor, previous: 0 })
    expect(home.pulse.orders).toMatchObject({ value: oracle.count, previous: 0 })
    // The history starts in October: 90 days before it is no comparison.
    expect(home.pulse.comparable).toBe(false)
    expect(home.pulse.revenue!.spark.reduce((n, v) => n + v, 0)).toBe(oracle.totalMinor)
    expect(home.widgets.revenue).toMatchObject({ totalMinor: oracle.totalMinor, previousMinor: 0, change: null })
    expect(home.widgets.revenue!.weekly).toBe(true)
    expect(home.widgets.revenue!.points.reduce((n, p) => n + p.orders, 0)).toBe(oracle.count)

    // Every order but a draft is in a stage or left out as cancelled or refunded.
    const stages = home.widgets.orders!.stages
    const staged = Object.values(stages).reduce((n, v) => n + v, 0)
    expect(staged).toBe(orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded").length)
    expect(home.widgets.countries!.rows.reduce((n, r) => n + r.orders, 0)).toBe(oracle.count)
    expect(home.widgets.live!.recent.map((r) => r.number)).toEqual(
      orders.toSorted((a, b) => b.placedAt - a.placedAt).slice(0, 5).map((o) => o.number)
    )
    expect(home.widgets.live!.today).toEqual({ count: 0, sumMinor: 0 })
    expect(home.widgets.bestsellers!.rows.length).toBeGreaterThan(0)
    expect(home.widgets.tickets).toMatchObject({ columns: { intake: 0, in_progress: 0, awaiting_reply: 0, done: 0 } })
    expect(home.widgets.mytickets).toEqual({ rows: [], total: 0 })
    expect(home.unconverted).toBe(0)

    // Thirty days back from today, October is outside the window.
    const month = ok(await rpc("Home.widgets", { ids: ["revenue", "orders"], range: 30 }, store.cookie))
    expect(month.pulse.revenue).toMatchObject({ value: 0, previous: oracle.totalMinor })
    expect(month.widgets.revenue!.change).toBe(-100)
    expect(Object.keys(month.widgets).toSorted()).toEqual(["orders", "revenue"])

    const breakdown = ok(await rpc("Home.revenueBreakdown", { range: 90 }, store.cookie))
    expect(breakdown).toMatchObject({ totalMinor: oracle.totalMinor, count: oracle.count, previousMinor: 0 })
    expect(breakdown.byStore.reduce((n, s) => n + s.valueMinor, 0)).toBe(oracle.totalMinor)
    expect(breakdown.excluded.cancelled + breakdown.excluded.refunded).toBe(
      orders.filter((o) => o.status === "cancelled" || o.status === "refunded").length
    )
    expect(breakdown.rates).toEqual([])

    const brief = ok(await rpc("Home.brief", undefined, store.cookie))
    expect(brief).toMatchObject({ evidence: 0, firstDay: false, urgent: 0 })
    expect(brief.delayed).toEqual(expect.any(Number))

    // Klantenservice holds no Analyse: no money figures, no breakdown.
    const email = `home-service-${run}@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const service = await join(email)
    const theirs = ok(await rpc("Home.widgets", { ids: [...ALL], range: 90 }, service))
    expect(theirs.pulse.revenue).toBeUndefined()
    expect(theirs.pulse.ontime).toBeUndefined()
    expect(theirs.widgets.revenue).toBeUndefined()
    expect(theirs.widgets.countries).toBeUndefined()
    expect(theirs.pulse.tickets).toBeDefined()
    expect(failure(await rpc("Home.revenueBreakdown", { range: 90 }, service))).toMatchObject({
      _tag: "Forbidden",
      permission: "analytics"
    })
  })

  it("puts a workspace without orders on its first day", async () => {
    const lone = await person("home-lone", "Home Lone B.V.")
    expect(ok(await rpc("Home.brief", undefined, lone.cookie))).toMatchObject({
      needsYou: 0,
      firstDay: true,
      delayed: 0
    })
    const home = ok(await rpc("Home.widgets", { ids: [...ALL], range: 30 }, lone.cookie))
    expect(home.pulse.revenue).toEqual({ value: 0, previous: 0, spark: Array(14).fill(0) })
    expect(home.widgets.live).toEqual({ today: { count: 0, sumMinor: 0 }, recent: [] })
    expect(home.widgets.stock).toEqual({ rows: [] })
    expect(home.widgets.chargebacks).toEqual({
      open: 0,
      atStakeMinor: 0,
      won: 0,
      decided: 0,
      submitted: 0,
      nearest: null
    })
  })
})
