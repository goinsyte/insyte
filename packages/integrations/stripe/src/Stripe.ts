import { BillingUnavailable } from "@insyte/modules/billing/domain/Billing"
import type { BillingProvider, PlanPrice, Target } from "@insyte/modules/billing/domain/Ports"
import { Data, Effect } from "effect"
import type StripeSdk from "stripe"
import { loadSdk, verifySignature } from "./Sdk.ts"
import { eventOf, invoiceOf, itemsOf, priceOf, pricesFor, STRIPE_VERSION, subscriptionOf } from "./Wire.ts"

/*
 * Stripe (M13 step 1) through its official SDK, at a pinned API version, in test or live mode by the key the stage
 * holds, over `fetch` as Workers need. The SDK loads on the first call (`Sdk.ts`); the API Worker loads this module on
 * the first billing call that needs it (`platform/Billing.ts`), never at startup. Prices are read from the account by
 * their `insyte_plan` metadata and kept for five minutes in the isolate. A change prorates (`create_prorations`) to the
 * preview's second, so what the console confirmed is what Stripe charges. Every request that moves money carries an
 * idempotency key: a request sent twice is one charge.
 */

const TIMEOUT_MS = 10_000
const PRICES_FOR_MS = 5 * 60_000

export interface StripeConfig {
  readonly secretKey: string
  readonly webhookSecret: string | null
}

type Provider = typeof BillingProvider.Service
type Raw = Record<string, unknown>

/** What the SDK threw, kept as it was until it is read below. */
class StripeFailure extends Data.TaggedError("StripeFailure")<{ readonly error: unknown }> {}

/** Stripe's own errors, by what they mean for the caller: it did not answer (try again), or it said no. */
const reasonOf = (error: unknown): "unreachable" | "refused" => {
  const e = error as { type?: string; statusCode?: number }
  if (e.type === "StripeConnectionError" || e.type === "StripeAPIError" || e.type === "StripeRateLimitError") {
    return "unreachable"
  }
  if (typeof e.statusCode === "number") return e.statusCode === 429 || e.statusCode >= 500 ? "unreachable" : "refused"
  // Not Stripe's: the SDK did not load, or the network failed before Stripe said anything.
  return "unreachable"
}

const isMissing = (failure: StripeFailure) => (failure.error as { statusCode?: number }).statusCode === 404

const describe = (error: unknown) => {
  const e = error as { type?: string; code?: string; statusCode?: number }
  return { type: e.type ?? "unknown", code: e.code ?? null, status: e.statusCode ?? null }
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

/** A short hash of what a customer is made with, so a customer made again with other details is a new request. */
const digest = async (value: string) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
  return Array.from(bytes.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Statuses of a subscription that is over: a new one may be started. */
const ENDED = new Set(["canceled", "incomplete_expired"])

/** Stripe's subscription in Insyte's words; one Insyte cannot read is a refusal. */
const read = (sub: unknown) => {
  const s = subscriptionOf(sub)
  return s === undefined ? Effect.fail(new BillingUnavailable({ reason: "refused" })) : Effect.succeed(s)
}

export const makeStripe = (config: StripeConfig): Provider => {
  let client: Promise<StripeSdk> | undefined
  const stripe = () => (client ??= loadSdk().then((Stripe) =>
    new Stripe(config.secretKey, {
      apiVersion: STRIPE_VERSION,
      httpClient: Stripe.createFetchHttpClient(),
      timeout: TIMEOUT_MS,
      maxNetworkRetries: 1
    })
  ).catch((error: unknown) => {
    client = undefined
    throw error
  }))

  const call = <A>(path: string, f: (s: StripeSdk) => Promise<A>): Effect.Effect<A, BillingUnavailable> =>
    Effect.tryPromise({ try: async () => f(await stripe()), catch: (error) => new StripeFailure({ error }) }).pipe(
      Effect.tapError((failure) => Effect.logWarning("stripe refused", { path, ...describe(failure.error) })),
      Effect.mapError((failure) => new BillingUnavailable({ reason: reasonOf(failure.error) })),
      Effect.withSpan("Stripe.call", { attributes: { path } })
    )

  /** A read of one object, or `undefined` where Stripe has no such object. */
  const find = <A>(path: string, f: (s: StripeSdk) => Promise<A>): Effect.Effect<A | undefined, BillingUnavailable> =>
    Effect.tryPromise({ try: async () => f(await stripe()), catch: (error) => new StripeFailure({ error }) }).pipe(
      Effect.catchIf(isMissing, () => Effect.succeed(undefined)),
      Effect.tapError((failure) => Effect.logWarning("stripe refused", { path, ...describe(failure.error) })),
      Effect.mapError((failure) => new BillingUnavailable({ reason: reasonOf(failure.error) })),
      Effect.withSpan("Stripe.call", { attributes: { path } })
    )

  let cached: { readonly at: number; readonly prices: ReadonlyArray<PlanPrice> } | undefined

  const prices = Effect.suspend(() => {
    if (cached !== undefined && Date.now() - cached.at < PRICES_FOR_MS) return Effect.succeed(cached.prices)
    return call("prices.list", (s) => s.prices.list({ active: true, limit: 100, type: "recurring" })).pipe(
      Effect.map((list) => {
        const found = list.data.flatMap((p) => {
          const price = priceOf(p)
          return price === undefined ? [] : [price]
        })
        cached = { at: Date.now(), prices: found }
        return found
      })
    )
  })

  const subscription = (id: string) =>
    call("subscriptions.retrieve", (s) => s.subscriptions.retrieve(id, { expand: ["default_payment_method"] }))

  return {
    configured: true,
    prices,
    createCustomer: ({ workspaceId, name, email }) =>
      Effect.promise(() => digest(`${name}\n${email ?? ""}`)).pipe(
        Effect.flatMap((hash) =>
          call("customers.create", (s) =>
            s.customers.create({
              name,
              ...(email === null ? {} : { email }),
              preferred_locales: ["nl"],
              metadata: { insyte_workspace: workspaceId }
            }, { idempotencyKey: `insyte-customer-${workspaceId}-${hash}` }))
        ),
        Effect.map((customer) => ({ customerId: customer.id }))
      ),
    checkout: ({ customerId, workspaceId, target, prices: all, successUrl, cancelUrl, idempotencyKey }) =>
      Effect.gen(function*() {
        const { base, seat } = pricesFor(all, target)
        if (base === undefined || (target.extraSeats > 0 && seat === undefined)) {
          return yield* new BillingUnavailable({ reason: "no_price" })
        }
        const session = yield* call("checkout.sessions.create", (s) =>
          s.checkout.sessions.create({
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
          }, { idempotencyKey }))
        if (session.url === null) return yield* new BillingUnavailable({ reason: "refused" })
        return { _tag: "redirect" as const, url: session.url, sessionId: session.id }
      }),
    checkoutSession: (id) =>
      find("checkout.sessions.retrieve", (s) => s.checkout.sessions.retrieve(id)).pipe(
        Effect.map((session) =>
          session === undefined || session.status === null ? undefined : {
            status: session.status,
            url: session.url,
            subscriptionId: typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? null
          }
        )
      ),
    expireCheckout: (id) =>
      call(
        "checkout.sessions.expire",
        (s) => s.checkout.sessions.expire(id, {}, { idempotencyKey: `insyte-expire-${id}` })
      ).pipe(Effect.asVoid),
    activeSubscription: (customerId) =>
      call("subscriptions.list", (s) =>
        s.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 10,
          expand: ["data.default_payment_method"]
        })).pipe(
          Effect.map((list) => {
            // The newest that has not ended.
            const newest = list.data
              .filter((sub) => !ENDED.has(sub.status))
              .reduce<(typeof list.data)[number] | undefined>(
                (best, sub) => (best === undefined || sub.created > best.created ? sub : best),
                undefined
              )
            return newest === undefined ? undefined : subscriptionOf(newest)
          })
        ),
    preview: ({ current, target, prices: all, prorationDate }) =>
      Effect.gen(function*() {
        const sub = yield* subscription(current.subscriptionId)
        const items = yield* itemsFor(sub as unknown as Raw, target, all)
        const invoice = yield* call("invoices.createPreview", (s) =>
          s.invoices.createPreview({
            customer: current.customerId,
            subscription: current.subscriptionId,
            subscription_details: { items, proration_behavior: "create_prorations", proration_date: prorationDate }
          }))
        const lines = invoice.lines.data as unknown as ReadonlyArray<Raw>
        const proration = lines.filter(isProration).reduce((sum, l) => sum + (Number(l["amount"]) || 0), 0)
        // Another interval starts a new period now, invoiced at once; otherwise the change waits for the next invoice.
        const immediate = target.cycle !== (current.cycle ?? "monthly")
        const next = immediate ? prorationDate : Number(invoice.next_payment_attempt ?? invoice.period_end)
        return {
          currency: invoice.currency,
          prorationMinor: proration,
          nextInvoiceMinor: invoice.total,
          nextInvoiceAt: Number.isFinite(next) && next > 0 ? new Date(next * 1000) : null,
          immediate
        }
      }),
    update: ({ current, target, prices: all, prorationDate }) =>
      Effect.gen(function*() {
        const sub = yield* subscription(current.subscriptionId)
        const items = yield* itemsFor(sub as unknown as Raw, target, all)
        const updated = yield* call("subscriptions.update", (s) =>
          s.subscriptions.update(current.subscriptionId, {
            items,
            proration_behavior: "create_prorations",
            proration_date: prorationDate,
            ...(current.workspaceId === null ? {} : { metadata: { insyte_workspace: current.workspaceId } }),
            expand: ["default_payment_method"]
          }, {
            idempotencyKey:
              `insyte-change-${current.subscriptionId}-${target.plan}-${target.cycle}-${target.extraSeats}-${prorationDate}`
          }))
        return yield* read(updated)
      }),
    setCancelAtPeriodEnd: ({ current, cancel }) =>
      call("subscriptions.update", (s) =>
        s.subscriptions.update(current.subscriptionId, {
          cancel_at_period_end: cancel,
          expand: ["default_payment_method"]
        }, {
          // Per request: the SDK's retry of it is one change, while cancelling again after resuming is another.
          idempotencyKey: `insyte-${cancel ? "cancel" : "resume"}-${current.subscriptionId}-${crypto.randomUUID()}`
        })).pipe(Effect.flatMap(read)),
    portal: ({ customerId, returnUrl }) =>
      call(
        "billingPortal.sessions.create",
        (s) => s.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl, locale: "nl" })
      ).pipe(Effect.map((session) => ({ url: session.url }))),
    subscription: (id) =>
      find("subscriptions.retrieve", (s) => s.subscriptions.retrieve(id, { expand: ["default_payment_method"] })).pipe(
        Effect.map((sub) => (sub === undefined ? undefined : subscriptionOf(sub)))
      ),
    invoice: (id) =>
      find("invoices.retrieve", (s) => s.invoices.retrieve(id)).pipe(
        Effect.map((inv) => (inv === undefined ? undefined : invoiceOf(inv)))
      ),
    verifyWebhook: (body, header, now) =>
      config.webhookSecret === null
        ? Effect.succeed(false)
        : Effect.promise(() => verifySignature(config.webhookSecret!, body, header, now)),
    readEvent: (body) => Effect.sync(() => eventOf(body))
  } satisfies Provider
}
