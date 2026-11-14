import { BillingUnavailable } from "@insyte/modules/billing/domain/Billing"
import { BillingProvider } from "@insyte/modules/billing/domain/Ports"
import { Config, Effect, Layer, Option, Redacted } from "effect"

/*
 * Billing (M13 step 1): Stripe's fake where the stage says `BILLING_ADAPTER=fake` (local runs, the worker tests,
 * previews); Stripe's API where the stage has `STRIPE_SECRET_KEY` (its test-mode key on staging, until production has
 * a live one); and where it has neither, no billing: the page shows the trial and every change says billing is not set
 * up. Webhooks are verified with `STRIPE_WEBHOOK_SECRET`. Either adapter's module loads on the first billing call in an
 * isolate, not at startup (ADR-0041 §3); one that fails to load is that call's `BillingUnavailable`, and the next
 * call tries again.
 */

type Provider = typeof BillingProvider.Service

const lazy = (load: () => Promise<Provider>): Provider => {
  let loading: Promise<Provider> | undefined
  const provider = Effect.tryPromise({
    try: () => (loading ??= load().catch((error: unknown) => {
      loading = undefined
      throw error
    })),
    catch: () => new BillingUnavailable({ reason: "unreachable" })
  }).pipe(Effect.tapError(() => Effect.logError("billing adapter did not load")))
  const using = <A, E>(f: (p: Provider) => Effect.Effect<A, E>) => Effect.flatMap(provider, f)
  return {
    configured: true,
    prices: using((p) => p.prices),
    createCustomer: (input) => using((p) => p.createCustomer(input)),
    checkout: (input) => using((p) => p.checkout(input)),
    preview: (input) => using((p) => p.preview(input)),
    update: (input) => using((p) => p.update(input)),
    setCancelAtPeriodEnd: (input) => using((p) => p.setCancelAtPeriodEnd(input)),
    portal: (input) => using((p) => p.portal(input)),
    subscription: (id) => using((p) => p.subscription(id)),
    // A module that does not load cannot verify: the delivery is refused, and Stripe sends it again.
    verifyWebhook: (body, header, now) =>
      provider.pipe(Effect.flatMap((p) => p.verifyWebhook(body, header, now)), Effect.orElseSucceed(() => false)),
    readEvent: (body) => provider.pipe(Effect.flatMap((p) => p.readEvent(body)), Effect.orElseSucceed(() => undefined))
  }
}

const off = new BillingUnavailable({ reason: "not_configured" })

const BillingUnset: Provider = {
  configured: false,
  prices: Effect.fail(off),
  createCustomer: () => Effect.fail(off),
  checkout: () => Effect.fail(off),
  preview: () => Effect.fail(off),
  update: () => Effect.fail(off),
  setCancelAtPeriodEnd: () => Effect.fail(off),
  portal: () => Effect.fail(off),
  subscription: () => Effect.fail(off),
  verifyWebhook: () => Effect.succeed(false),
  readEvent: () => Effect.undefined
}

export const BillingChoice = Layer.unwrap(
  Effect.gen(function*() {
    const adapter = yield* Config.String("BILLING_ADAPTER").pipe(Config.withDefault("stripe"))
    const key = yield* Config.Redacted("STRIPE_SECRET_KEY").pipe(Config.option)
    const secret = yield* Config.Redacted("STRIPE_WEBHOOK_SECRET").pipe(Config.option)
    const webhookSecret = Option.match(secret, { onNone: () => null, onSome: Redacted.value })
    if (adapter === "fake") {
      return Layer.succeed(
        BillingProvider,
        lazy(() => import("@insyte/integrations-stripe/StripeFake").then((m) => m.makeFake({ webhookSecret })))
      )
    }
    if (Option.isSome(key)) {
      const secretKey = Redacted.value(key.value)
      return Layer.succeed(
        BillingProvider,
        lazy(() => import("@insyte/integrations-stripe/Stripe").then((m) => m.makeStripe({ secretKey, webhookSecret })))
      )
    }
    return Layer.succeed(BillingProvider, BillingUnset)
  })
)
