import { Effect } from "effect"
import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { makeStripe } from "../src/Stripe.ts"
import { eventOf, form, signatureHeader, STRIPE_VERSION, subscriptionOf, verifySignature } from "../src/Wire.ts"

/*
 * Stripe's adapter without Stripe: the webhook signature as Stripe computes it, how a subscription and an event read in
 * Insyte's words, the form encoding, and what a change sends (the pinned version, the proration to the preview's
 * second, one change per idempotency key). The secret is made up for the test.
 */

const SECRET = "whsec_test_insyte_unit"
const body = new TextEncoder().encode(JSON.stringify({ id: "evt_1", type: "invoice.paid" }))

const price = (plan: string, interval: "month" | "year", amount: number) => ({
  id: `price_${plan}_${interval}`,
  active: true,
  currency: "eur",
  unit_amount: amount,
  recurring: { interval },
  metadata: { insyte_plan: plan }
})

const SUBSCRIPTION = {
  id: "sub_1",
  object: "subscription",
  customer: "cus_1",
  status: "active",
  currency: "eur",
  cancel_at_period_end: true,
  cancel_at: null,
  metadata: { insyte_workspace: "ws_1" },
  default_payment_method: { card: { brand: "mastercard", last4: "4444", exp_month: 3, exp_year: 2030 } },
  items: {
    data: [
      { id: "si_base", quantity: 1, current_period_end: 1_800_000_000, price: price("growth", "month", 29_900) },
      { id: "si_seat", quantity: 2, current_period_end: 1_800_000_000, price: price("seat", "month", 1_900) }
    ]
  }
}

describe("the webhook signature", () => {
  it("is Stripe's hex HMAC-SHA256 of `t.body`, within five minutes either way", async () => {
    const at = new Date("2026-11-14T12:00:00Z")
    const header = await signatureHeader(SECRET, body, at)
    const t = Math.floor(at.getTime() / 1000)
    const hmac = createHmac("sha256", SECRET).update(`${t}.`).update(body).digest("hex")
    expect(header).toBe(`t=${t},v1=${hmac}`)

    expect(await verifySignature(SECRET, body, header, at)).toBe(true)
    expect(await verifySignature(SECRET, body, header, new Date(at.getTime() + 299_000))).toBe(true)
    expect(await verifySignature(SECRET, body, header, new Date(at.getTime() + 301_000))).toBe(false)
    expect(await verifySignature(SECRET, body, header, new Date(at.getTime() - 301_000))).toBe(false)
    // Another secret, another body, no `v1`, no time: refused.
    expect(await verifySignature("whsec_other", body, header, at)).toBe(false)
    expect(await verifySignature(SECRET, new TextEncoder().encode("{}"), header, at)).toBe(false)
    expect(await verifySignature(SECRET, body, `t=${t}`, at)).toBe(false)
    expect(await verifySignature(SECRET, body, `v1=${hmac}`, at)).toBe(false)
    // While a secret is rolled, Stripe signs with both: either one will do.
    expect(await verifySignature(SECRET, body, `t=${t},v1=${"0".repeat(64)},v1=${hmac}`, at)).toBe(true)
  })
})

const event = (type: string, object: unknown) => ({ id: "evt_1", type, created: 1_700_000_000, data: { object } })

describe("Stripe's objects in Insyte's words", () => {
  it("reads a subscription's plan, cycle, seats, period, cancellation and card", () => {
    expect(subscriptionOf(SUBSCRIPTION)).toEqual({
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      plan: "growth",
      cycle: "monthly",
      extraSeats: 2,
      currency: "eur",
      currentPeriodEnd: new Date(1_800_000_000_000),
      cancelAt: new Date(1_800_000_000_000),
      card: { brand: "Mastercard", last4: "4444", expiry: "03/2030" },
      workspaceId: "ws_1"
    })
    expect(subscriptionOf({ ...SUBSCRIPTION, status: "weird" })).toBeUndefined()
  })

  it("reads an event by its type, and leaves what Insyte does not act on as other", () => {
    expect(eventOf(event("customer.subscription.updated", SUBSCRIPTION))).toMatchObject({
      kind: "subscription",
      created: new Date(1_700_000_000_000),
      subscription: { subscriptionId: "sub_1", extraSeats: 2 }
    })
    expect(eventOf(event("invoice.paid", {
      id: "in_1",
      customer: "cus_1",
      number: "INS-0001",
      status: "paid",
      total: 33_700,
      currency: "eur",
      created: 1_700_000_000,
      invoice_pdf: "https://pay.stripe.test/in_1.pdf"
    }))).toMatchObject({ kind: "invoice", invoice: { id: "in_1", amountMinor: 33_700, pdfUrl: expect.any(String) } })
    expect(eventOf(event("checkout.session.completed", {
      mode: "subscription",
      customer: "cus_1",
      subscription: "sub_1",
      client_reference_id: "ws_1"
    }))).toMatchObject({ kind: "checkout", customerId: "cus_1", subscriptionId: "sub_1", workspaceId: "ws_1" })
    expect(eventOf(event("customer.created", {}))).toMatchObject({ kind: "other" })
    expect(eventOf({ id: "evt_1" })).toBeUndefined()
  })

  it("encodes nested forms as Stripe reads them", () => {
    expect(form({ items: [{ id: "si_1", deleted: true }], metadata: { a: "b c" }, skip: undefined })).toBe(
      "items%5B0%5D%5Bid%5D=si_1&items%5B0%5D%5Bdeleted%5D=true&metadata%5Ba%5D=b%20c"
    )
  })
})

describe("a change at Stripe", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("swaps the plan, sets the seats and prorates to the preview's second, once per key", async () => {
    const seen: Array<{ method: string; url: string; headers: Record<string, string>; body: string }> = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({
        method: init.method ?? "GET",
        url,
        headers: init.headers as Record<string, string>,
        body: typeof init.body === "string" ? init.body : ""
      })
      return Response.json(SUBSCRIPTION)
    })
    const stripe = makeStripe({ secretKey: "sk_test_made_up", webhookSecret: null })
    const current = subscriptionOf(SUBSCRIPTION)!
    const prices = [price("growth", "month", 29_900), price("scale", "month", 49_900), price("seat", "month", 1_900)]
      .map((p) => ({
        plan: p.metadata.insyte_plan as never,
        cycle: "monthly" as const,
        priceId: p.id,
        unitAmountMinor: p.unit_amount,
        currency: "eur"
      }))

    await Effect.runPromise(stripe.update({
      current,
      target: { plan: "scale", cycle: "monthly", extraSeats: 0 },
      prices,
      prorationDate: 1_799_000_000
    }))

    const [read, write] = seen
    expect(read).toMatchObject({ method: "GET", url: expect.stringContaining("/v1/subscriptions/sub_1?") })
    expect(write!.url).toBe("https://api.stripe.com/v1/subscriptions/sub_1")
    expect(write!.headers).toMatchObject({
      authorization: "Bearer sk_test_made_up",
      "stripe-version": STRIPE_VERSION,
      "idempotency-key": "insyte-change-sub_1-scale-monthly-0-1799000000"
    })
    const params = new URLSearchParams(write!.body)
    expect(params.get("items[0][id]")).toBe("si_base")
    expect(params.get("items[0][price]")).toBe("price_scale_month")
    // No extra seats left: the seat line goes.
    expect(params.get("items[1][id]")).toBe("si_seat")
    expect(params.get("items[1][deleted]")).toBe("true")
    expect(params.get("proration_behavior")).toBe("create_prorations")
    expect(params.get("proration_date")).toBe("1799000000")
  })

  it("is unavailable, not a defect, when Stripe does not answer or refuses", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { type: "invalid_request_error" } }, { status: 400 }))
    const refused = await Effect.runPromise(
      Effect.flip(makeStripe({ secretKey: "sk_test_made_up", webhookSecret: null }).prices)
    )
    expect(refused).toMatchObject({ _tag: "BillingUnavailable", reason: "refused" })
    vi.stubGlobal("fetch", async () => Response.json({}, { status: 503 }))
    const down = await Effect.runPromise(
      Effect.flip(makeStripe({ secretKey: "sk_test_made_up", webhookSecret: null }).prices)
    )
    expect(down).toMatchObject({ _tag: "BillingUnavailable", reason: "unreachable" })
  })
})
