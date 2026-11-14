import type * as Module from "@insyte/modules/billing/Billing"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `POST /hooks/stripe` (M13 step 1): Stripe's webhooks for Insyte's own billing, on the API's public hostname, beside
 * Shopify's and AfterShip's (ADR-0041: inbound webhooks are the API Worker's). The raw bytes are verified against the
 * stage's signing secret before anything is parsed; the slice loads with the first delivery, not at startup.
 */

let loading: Promise<typeof Module> | undefined

const load = Effect.promise(() => (loading ??= import("@insyte/modules/billing/Billing").catch((error: unknown) => {
  loading = undefined
  throw error
})))

export const StripeHookRoutes = HttpRouter.add(
  "POST",
  "/hooks/stripe",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = new Uint8Array(yield* Effect.orDie(request.arrayBuffer))
    const { receiveWebhook } = yield* load
    const { status } = yield* receiveWebhook({ body, signature: request.headers["stripe-signature"] ?? "" })
    return HttpServerResponse.empty({ status })
  }).pipe(withRequestDb, Effect.withSpan("Billing.hookRoute"))
)
