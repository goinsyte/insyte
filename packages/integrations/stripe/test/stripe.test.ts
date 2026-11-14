import { Effect } from "effect"
import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { testSignature, verifySignature } from "../src/Sdk.ts"
import { makeStripe } from "../src/Stripe.ts"
import { eventOf, STRIPE_VERSION, subscriptionOf } from "../src/Wire.ts"

/*
 * Stripe's adapter without Stripe: the webhook signature as Stripe's SDK checks it, how a subscription and an event read
 * in Insyte's words, and what a change sends through the SDK (the pinned version, the proration to the preview's
 * second, one change per idempotency key). `fetch` is stubbed; the key and secret are made up for the test.
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
    const text = new TextDecoder().decode(body)
    const header = await testSignature(SECRET, text, at)
    const t = Math.floor(at.getTime() / 1000)
    const hmac = createHmac("sha256", SECRET).update(`${t}.`).update(body).digest("hex")
    expect(header).toBe(`t=${t},v1=${hmac}`)

    expect(await verifySignature(SECRET, body, header, at)).toBe(true)
    expect(await verifySignature(SECRET, body, header, new Date(at.getTime() + 299_000))).toBe(true)
    expect(await verifySignature(SECRET, body, header, new Date(at.getTime() + 301_000))).toBe(false)
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
})

describe("a change at Stripe", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("swaps the plan, sets the seats and prorates to the preview's second, once per key", async () => {
    const seen: Array<{ method: string; url: string; headers: Record<string, string>; body: string }> = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({
        method: init.method ?? "GET",
        url,
        headers: Object.fromEntries(new Headers(init.headers)),
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
    expect(write!.method).toBe("POST")
    expect(write!.url).toBe("https://api.stripe.com/v1/subscriptions/sub_1")
    expect(write!.headers).toMatchObject({
      authorization: expect.stringContaining("sk_test_made_up"),
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

  it("makes a customer and a checkout once per key, as the caller names it", async () => {
    const keys: Array<string | null> = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      keys.push(new Headers(init.headers).get("idempotency-key"))
      return Response.json(
        url.includes("/v1/customers")
          ? { id: "cus_1", object: "customer" }
          : { id: "cs_1", object: "checkout.session", url: "https://checkout.stripe.test/cs_1" }
      )
    })
    const stripe = makeStripe({ secretKey: "sk_test_made_up", webhookSecret: null })
    const made = (name: string) =>
      Effect.runPromise(stripe.createCustomer({ workspaceId: "ws_1", name, email: "eigenaar@example.test" }))
    await made("Winkel")
    await made("Winkel")
    await made("Winkel B.V.")
    // The same details are the same request; other details, another one.
    expect(keys[0]).toMatch(/^insyte-customer-ws_1-[0-9a-f]{16}$/)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])

    const opened = await Effect.runPromise(stripe.checkout({
      customerId: "cus_1",
      workspaceId: "ws_1",
      target: { plan: "growth", cycle: "monthly", extraSeats: 0 },
      prices: [{
        plan: "growth",
        cycle: "monthly",
        priceId: "price_growth_month",
        unitAmountMinor: 29_900,
        currency: "eur"
      }],
      successUrl: "https://app.example.test/instellingen/abonnement?betaald=1",
      cancelUrl: "https://app.example.test/instellingen/abonnement",
      idempotencyKey: "insyte-checkout-ws_1-growth-monthly-0-first"
    }))
    expect(opened).toEqual({ _tag: "redirect", url: "https://checkout.stripe.test/cs_1", sessionId: "cs_1" })
    expect(keys[3]).toBe("insyte-checkout-ws_1-growth-monthly-0-first")
  })

  it("changes the period only once it is paid, and keeps what an earlier request with the key made", async () => {
    const yearly = [price("growth", "year", 299_000), price("seat", "year", 19_000)].map((p) => ({
      plan: p.metadata.insyte_plan as never,
      cycle: "annual" as const,
      priceId: p.id,
      unitAmountMinor: p.unit_amount,
      currency: "eur"
    }))
    const current = subscriptionOf(SUBSCRIPTION)!
    const target = { plan: "growth" as const, cycle: "annual" as const, extraSeats: 2 }
    const sent: Array<{ method: string; body: string }> = []
    let answer: (method: string) => Response = () => Response.json(SUBSCRIPTION)
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const method = init.method ?? "GET"
      sent.push({ method, body: typeof init.body === "string" ? init.body : "" })
      return answer(method)
    })
    const stripe = makeStripe({ secretKey: "sk_test_made_up", webhookSecret: null })
    const change = () =>
      Effect.runPromise(Effect.result(stripe.update({ current, target, prices: yearly, prorationDate: 1 })))

    // Another period: Stripe's pending update, which takes no metadata.
    expect((await change())._tag).toBe("Success")
    const params = new URLSearchParams(sent.find((r) => r.method === "POST")!.body)
    expect(params.get("payment_behavior")).toBe("pending_if_incomplete")
    expect(params.get("metadata[insyte_workspace]")).toBeNull()

    // Its payment did not go through: the subscription is as it was, and the caller says so.
    answer = () => Response.json({ ...SUBSCRIPTION, pending_update: { expires_at: 1_800_000_000 } })
    expect(await change()).toMatchObject({ _tag: "Failure", failure: { reason: "payment_failed" } })

    // The key was sent before with other parameters: what Stripe kept is read and answered.
    sent.length = 0
    answer = (method) =>
      method === "POST"
        ? Response.json({ error: { type: "idempotency_error", message: "Keys for idempotent requests" } }, {
          status: 400
        })
        : Response.json(SUBSCRIPTION)
    expect(await change()).toMatchObject({ _tag: "Success", success: { subscriptionId: "sub_1" } })
    expect(sent.map((r) => r.method)).toEqual(["GET", "POST", "GET"])
  })

  it("previews what is charged, never below zero, and the credit left over", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      Response.json(
        url.includes("/v1/invoices/create_preview")
          ? {
            object: "invoice",
            currency: "eur",
            total: -12_000,
            amount_due: 0,
            ending_balance: -12_000,
            period_end: 1_800_000_000,
            lines: { data: [{ amount: -12_000, parent: { subscription_item_details: { proration: true } } }] }
          }
          : SUBSCRIPTION
      ))
    const stripe = makeStripe({ secretKey: "sk_test_made_up", webhookSecret: null })
    const preview = await Effect.runPromise(stripe.preview({
      current: subscriptionOf(SUBSCRIPTION)!,
      target: { plan: "growth", cycle: "monthly", extraSeats: 0 },
      prices: [price("growth", "month", 29_900)].map((p) => ({
        plan: "growth" as const,
        cycle: "monthly" as const,
        priceId: p.id,
        unitAmountMinor: p.unit_amount,
        currency: "eur"
      })),
      prorationDate: 1_799_000_000
    }))
    expect(preview).toMatchObject({ nextInvoiceMinor: 0, prorationMinor: -12_000, creditMinor: 12_000 })
  })

  it("opens Checkout for half an hour, and says when the customer is gone", async () => {
    const bodies: Array<string> = []
    let gone = false
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(typeof init.body === "string" ? init.body : "")
      return gone
        ? Response.json({
          error: { type: "invalid_request_error", code: "resource_missing", param: "customer" }
        }, { status: 400 })
        : Response.json({ id: "cs_1", object: "checkout.session", url: "https://checkout.stripe.test/cs_1" })
    })
    const stripe = makeStripe({ secretKey: "sk_test_made_up", webhookSecret: null })
    const open = () =>
      Effect.runPromise(Effect.result(stripe.checkout({
        customerId: "cus_1",
        workspaceId: "ws_1",
        target: { plan: "growth", cycle: "monthly", extraSeats: 0 },
        prices: [{
          plan: "growth",
          cycle: "monthly",
          priceId: "price_growth_month",
          unitAmountMinor: 29_900,
          currency: "eur"
        }],
        successUrl: "https://app.example.test/settings/billing?betaald=1",
        cancelUrl: "https://app.example.test/settings/billing",
        idempotencyKey: "insyte-checkout-ws_1-nonce"
      })))
    const before = Math.floor(Date.now() / 1000)
    expect((await open())._tag).toBe("Success")
    const expires = Number(new URLSearchParams(bodies[0]).get("expires_at"))
    expect(expires - before).toBeGreaterThanOrEqual(30 * 60)
    expect(expires - before).toBeLessThanOrEqual(32 * 60)
    gone = true
    expect(await open()).toMatchObject({ _tag: "Failure", failure: { reason: "no_customer" } })
  })

  it("is unavailable, not a defect, when Stripe does not answer or refuses", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { type: "invalid_request_error" } }, { status: 400 }))
    const refused = await Effect.runPromise(
      Effect.flip(makeStripe({ secretKey: "sk_test_made_up", webhookSecret: null }).prices)
    )
    expect(refused).toMatchObject({ _tag: "BillingUnavailable", reason: "refused" })
    let tries = 0
    vi.stubGlobal("fetch", async () => {
      tries += 1
      return Response.json({ error: { type: "api_error" } }, { status: 503 })
    })
    const down = await Effect.runPromise(
      Effect.flip(makeStripe({ secretKey: "sk_test_made_up", webhookSecret: null }).prices)
    )
    expect(down).toMatchObject({ _tag: "BillingUnavailable", reason: "unreachable" })
    // Tried once more, then given up: the caller says Stripe did not answer.
    expect(tries).toBe(2)
  })
})
