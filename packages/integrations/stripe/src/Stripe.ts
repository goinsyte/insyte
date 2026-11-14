import { BillingUnavailable } from "@insyte/modules/billing/domain/Billing"
import type { BillingProvider, PlanPrice, Target } from "@insyte/modules/billing/domain/Ports"
import { Effect } from "effect"
import { eventOf, form, itemsOf, priceOf, pricesFor, STRIPE_VERSION, subscriptionOf, verifySignature } from "./Wire.ts"

/*
 * Stripe's REST API (M13 step 1), over `fetch`, at a pinned API version, test or live mode by the key the stage holds.
 * No SDK: the calls are a handful of form posts. The API Worker loads this module on the first billing call that needs
 * it (`platform/Billing.ts`), never at startup. Prices are read from the account by their `insyte_plan` metadata and
 * kept for five minutes in the isolate. A change prorates (`create_prorations`) to the preview's second, so what the
 * console confirmed is what Stripe charges; a repeated call with the same change is one change (`Idempotency-Key`).
 */

const BASE = "https://api.stripe.com/v1"
const TIMEOUT_MS = 10_000
const PRICES_FOR_MS = 5 * 60_000

type Raw = Record<string, unknown>

export interface StripeConfig {
  readonly secretKey: string
  readonly webhookSecret: string | null
}

type Provider = typeof BillingProvider.Service

const read = (json: Raw) => {
  const s = subscriptionOf(json)
  return s === undefined ? Effect.fail(new BillingUnavailable({ reason: "refused" })) : Effect.succeed(s)
}

/** The items that make `current` into `target`: the plan's price swapped, the seat line set, added or dropped. */
const itemsFor = (sub: Raw, target: Target, all: ReadonlyArray<PlanPrice>) =>
  Effect.gen(function*() {
    const { base, seat } = pricesFor(all, target)
    if (base === undefined || (target.extraSeats > 0 && seat === undefined)) {
      return yield* new BillingUnavailable({ reason: "no_price" })
    }
    const items = itemsOf(sub)
    const plan = (i: (typeof items)[number]) => (i.price?.["metadata"] as Raw | undefined)?.["insyte_plan"]
    const baseItem = items.find((i) => plan(i) !== "seat" && plan(i) !== undefined) ?? items[0]
    const seatItem = items.find((i) => plan(i) === "seat")
    return [
      baseItem === undefined
        ? { price: base.priceId, quantity: 1 }
        : { id: baseItem.id, price: base.priceId, quantity: 1 },
      ...(seatItem === undefined
        ? target.extraSeats > 0 ? [{ price: seat!.priceId, quantity: target.extraSeats }] : []
        : target.extraSeats > 0
        ? [{ id: seatItem.id, price: seat!.priceId, quantity: target.extraSeats }]
        : [{ id: seatItem.id, deleted: true }])
    ]
  })

const isProration = (line: Raw) =>
  line["proration"] === true ||
  ((line["parent"] as Raw | undefined)?.["subscription_item_details"] as Raw | undefined)?.["proration"] === true

export const makeStripe = (config: StripeConfig): Provider => {
  const call = (
    method: "GET" | "POST",
    path: string,
    params: Record<string, unknown> = {},
    idempotencyKey?: string
  ): Effect.Effect<Raw, BillingUnavailable> =>
    Effect.tryPromise({
      try: async (signal) => {
        const body = form(params)
        const url = method === "GET" && body !== "" ? `${BASE}${path}?${body}` : `${BASE}${path}`
        const response = await fetch(url, {
          method,
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
          headers: {
            authorization: `Bearer ${config.secretKey}`,
            "stripe-version": STRIPE_VERSION,
            ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
            ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey })
          },
          ...(method === "POST" ? { body } : {})
        })
        const json = (await response.json().catch(() => ({}))) as Raw
        return { status: response.status, json }
      },
      catch: () => new BillingUnavailable({ reason: "unreachable" })
    }).pipe(
      Effect.flatMap(({ status, json }) => {
        if (status >= 200 && status < 300) return Effect.succeed(json)
        const error = (json["error"] as Raw | undefined) ?? {}
        return Effect.logWarning("stripe refused", {
          path,
          status,
          type: error["type"],
          code: error["code"]
        }).pipe(
          Effect.andThen(
            new BillingUnavailable({ reason: status === 429 || status >= 500 ? "unreachable" : "refused" })
          )
        )
      }),
      Effect.withSpan("Stripe.call", {
        attributes: { method, path: path.replace(/\/(sub|cus|in|price)_[^/]+/, "/:id") }
      })
    )

  let cached: { readonly at: number; readonly prices: ReadonlyArray<PlanPrice> } | undefined

  const prices = Effect.suspend(() => {
    if (cached !== undefined && Date.now() - cached.at < PRICES_FOR_MS) return Effect.succeed(cached.prices)
    return call("GET", "/prices", { active: true, limit: 100, type: "recurring" }).pipe(
      Effect.map((json) => {
        const data = Array.isArray(json["data"]) ? json["data"] : []
        const read = data.flatMap((p) => {
          const price = priceOf(p)
          return price === undefined ? [] : [price]
        })
        cached = { at: Date.now(), prices: read }
        return read
      })
    )
  })

  const subscription = (id: string) =>
    call("GET", `/subscriptions/${encodeURIComponent(id)}`, { expand: ["default_payment_method"] })

  return {
    configured: true,
    prices,
    createCustomer: ({ workspaceId, name, email }) =>
      call("POST", "/customers", {
        name,
        email: email ?? undefined,
        preferred_locales: ["nl"],
        metadata: { insyte_workspace: workspaceId }
      }, `insyte-customer-${workspaceId}`).pipe(Effect.map((json) => ({ customerId: String(json["id"]) }))),
    checkout: ({ customerId, workspaceId, target, prices: all, successUrl, cancelUrl }) =>
      Effect.gen(function*() {
        const { base, seat } = pricesFor(all, target)
        if (base === undefined || (target.extraSeats > 0 && seat === undefined)) {
          return yield* new BillingUnavailable({ reason: "no_price" })
        }
        const session = yield* call("POST", "/checkout/sessions", {
          mode: "subscription",
          customer: customerId,
          client_reference_id: workspaceId,
          locale: "nl",
          success_url: successUrl,
          cancel_url: cancelUrl,
          line_items: [
            { price: base.priceId, quantity: 1 },
            ...(target.extraSeats > 0 ? [{ price: seat!.priceId, quantity: target.extraSeats }] : [])
          ],
          subscription_data: { metadata: { insyte_workspace: workspaceId } }
        })
        const url = typeof session["url"] === "string" ? session["url"] : null
        if (url === null) return yield* new BillingUnavailable({ reason: "refused" })
        return { _tag: "redirect" as const, url }
      }),
    preview: ({ current, target, prices: all, prorationDate }) =>
      Effect.gen(function*() {
        const sub = yield* subscription(current.subscriptionId)
        const items = yield* itemsFor(sub, target, all)
        const invoice = yield* call("POST", "/invoices/create_preview", {
          customer: current.customerId,
          subscription: current.subscriptionId,
          subscription_details: { items, proration_behavior: "create_prorations", proration_date: prorationDate }
        })
        const lines = ((invoice["lines"] as Raw | undefined)?.["data"] as Array<Raw> | undefined) ?? []
        const proration = lines.filter(isProration).reduce((sum, l) => sum + (Number(l["amount"]) || 0), 0)
        const next = Number(invoice["next_payment_attempt"] ?? invoice["period_end"])
        return {
          currency: typeof invoice["currency"] === "string" ? invoice["currency"] : current.currency,
          prorationMinor: proration,
          nextInvoiceMinor: Number(invoice["total"]) || 0,
          nextInvoiceAt: Number.isFinite(next) && next > 0 ? new Date(next * 1000) : null
        }
      }),
    update: ({ current, target, prices: all, prorationDate }) =>
      Effect.gen(function*() {
        const sub = yield* subscription(current.subscriptionId)
        const items = yield* itemsFor(sub, target, all)
        const json = yield* call(
          "POST",
          `/subscriptions/${encodeURIComponent(current.subscriptionId)}`,
          {
            items,
            proration_behavior: "create_prorations",
            proration_date: prorationDate,
            metadata: { insyte_workspace: current.workspaceId ?? undefined },
            expand: ["default_payment_method"]
          },
          `insyte-change-${current.subscriptionId}-${target.plan}-${target.cycle}-${target.extraSeats}-${prorationDate}`
        )
        return yield* read(json)
      }),
    setCancelAtPeriodEnd: ({ current, cancel }) =>
      call("POST", `/subscriptions/${encodeURIComponent(current.subscriptionId)}`, {
        cancel_at_period_end: cancel,
        expand: ["default_payment_method"]
      }).pipe(Effect.flatMap(read)),
    portal: ({ customerId, returnUrl }) =>
      call("POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl, locale: "nl" }).pipe(
        Effect.flatMap((json) =>
          typeof json["url"] === "string"
            ? Effect.succeed({ url: json["url"] })
            : Effect.fail(new BillingUnavailable({ reason: "refused" }))
        )
      ),
    subscription: (id) => subscription(id).pipe(Effect.map((json) => subscriptionOf(json))),
    verifyWebhook: (body, header, now) =>
      config.webhookSecret === null
        ? Effect.succeed(false)
        : Effect.promise(() => verifySignature(config.webhookSecret!, body, header, now)),
    readEvent: (body) => Effect.sync(() => eventOf(body))
  } satisfies Provider
}
