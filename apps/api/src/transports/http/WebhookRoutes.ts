import { receive } from "@insyte/modules/stores/use-cases/webhooks"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `POST /hooks/shopify` (M6.3): Shopify's webhooks and its compliance topics, on the API's public hostname (the app's
 * toml names it). The use case verifies the raw bytes before anything is parsed and answers 401 to a bad signature;
 * a good delivery is written and queued, and answered within Shopify's five seconds.
 */
export const WebhookRoutes = HttpRouter.add(
  "POST",
  "/hooks/shopify",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = new Uint8Array(yield* Effect.orDie(request.arrayBuffer))
    const header = (name: string) => request.headers[name] ?? ""
    const { status } = yield* receive({
      topic: header("x-shopify-topic"),
      shop: header("x-shopify-shop-domain"),
      deliveryId: header("x-shopify-webhook-id"),
      hmac: header("x-shopify-hmac-sha256"),
      body
    }).pipe(Effect.catchTag("SqlError", Effect.die))
    return HttpServerResponse.empty({ status })
  }).pipe(withRequestDb, Effect.withSpan("Stores.webhookRoute"))
)
