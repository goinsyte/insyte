import { describe, expect, it } from "vitest"
import { ok, person, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * `fx_rates` from the ECB's reference rates (§0.4), through the recorded twin: Friday 6, Monday 9 and Tuesday 10
 * November 2026. The fill crosses every ECB currency into each currency a workspace can count in, and a second fill
 * writes nothing. A day without a rate (a weekend, or any day after the last one recorded) converts at the latest day
 * before it, as Start's figures read it.
 */

type Rate = { day: string; base: string; quote: string; rate: string }

const fill = async () =>
  await (await call("http://api.test/api/__dev/fx/fill", { method: "POST" })).json() as { written: number }
const rates = async () => (await (await call("http://api.test/api/__dev/fx")).json() as { rates: Array<Rate> }).rates
const rate = (all: Array<Rate>, day: string, base: string, quote: string) =>
  all.find((r) => r.day === day && r.base === base && r.quote === quote)?.rate

const dayIn = (timeZone: string, at: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)

describe("fx_rates from the ECB", () => {
  it("fills every ECB currency into each workspace currency, crossed through the euro, and again writes nothing", async () => {
    await fill()
    expect((await fill()).written).toBe(0)
    const all = await rates()
    // 1 EUR = 1.1214 USD on the 10th: 1 USD = 1 / 1.1214 EUR, to eight places.
    expect(rate(all, "2026-11-10", "EUR", "USD")).toBe("1.12140000")
    expect(rate(all, "2026-11-10", "USD", "EUR")).toBe("0.89174246")
    // Pound into dollar, through the euro: 1.1214 / 0.83545.
    expect(rate(all, "2026-11-10", "GBP", "USD")).toBe("1.34227063")
    expect(rate(all, "2026-11-06", "CHF", "EUR")).toBe("1.09373291")
    // Only the currencies a workspace counts in are quotes; no rate of a currency into itself.
    const recorded = all.filter((r) => ["2026-11-06", "2026-11-09", "2026-11-10"].includes(r.day))
    expect(new Set(recorded.map((r) => r.quote))).toEqual(new Set(["EUR", "USD", "GBP", "JPY"]))
    expect(recorded.some((r) => r.base === r.quote)).toBe(false)
    // The weekend has no rows.
    expect(all.some((r) => r.day === "2026-11-07" || r.day === "2026-11-08")).toBe(false)
  })

  it("converts an order on a day without a rate at the latest day before it", async () => {
    await fill()
    const owner = await person(`fx-${run}`, "Fx B.V.")
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const seed = await call("http://api.test/api/__dev/stores/seed", {
      method: "POST",
      headers: { cookie: owner.cookie }
    })
    const { storeId } = await seed.json() as { storeId: string }
    // Yesterday, in dollars: no rate of its own (the recorded days end on 10 November), so the latest before it.
    const placedAt = new Date(Date.now() - 86_400_000).toISOString()
    const order = {
      shopify_id: `gid://shopify/Order/fx${run}`,
      number: `#FX${run}`,
      customer_shopify_id: null,
      customer_name: "Klant FX",
      customer_email: null,
      status: "paid",
      payment_status: "paid",
      fulfillment_status: "unfulfilled",
      total_minor: 11214,
      subtotal_minor: 11214,
      shipping_minor: 0,
      tax_minor: 0,
      discounts_minor: 0,
      currency: "USD",
      payment_gateway: null,
      card_last4: null,
      shipping_address: { country: "US" },
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
    }
    const written = await call(`http://api.test/api/__dev/facts/orders?workspace=${workspace}&store=${storeId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch: { orders: [order] } })
    })
    expect(written.status).toBe(200)

    const placedDay = dayIn("Europe/Amsterdam", Date.parse(placedAt))
    const latest = (await rates())
      .filter((r) => r.base === "USD" && r.quote === "EUR" && r.day <= placedDay)
      .toSorted((a, b) => b.day.localeCompare(a.day))[0]!
    expect(latest.day < placedDay).toBe(true)

    const breakdown = ok(await rpc("Home.revenueBreakdown", { range: 7 }, owner.cookie))
    expect(breakdown.unconverted).toBe(0)
    expect(breakdown.rates).toEqual([{ day: latest.day, base: "USD", quote: "EUR", rate: Number(latest.rate) }])
    expect(breakdown.totalMinor).toBe(Math.round(11214 * Number(latest.rate)))
  })
})
