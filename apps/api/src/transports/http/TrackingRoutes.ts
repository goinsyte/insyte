import { receive } from "@insyte/modules/tracking/use-cases/tracking"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `POST /hooks/aftership` (M8.4): AfterShip's status updates for the parcels Insyte registered, on the API's public
 * hostname. The raw bytes are verified before anything is parsed; a good delivery is applied and answered 200, so
 * AfterShip does not retry it.
 */
export const TrackingRoutes = HttpRouter.add(
  "POST",
  "/hooks/aftership",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = new Uint8Array(yield* Effect.orDie(request.arrayBuffer))
    const status = yield* receive({ body, signature: request.headers["aftership-hmac-sha256"] ?? "" }).pipe(
      Effect.orDie
    )
    return HttpServerResponse.empty({ status })
  }).pipe(withRequestDb, Effect.withSpan("Tracking.hookRoute"))
)
