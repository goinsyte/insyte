import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { requestAuth } from "../../platform/RequestAuth.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * better-auth's routes (12 §3): sign-up, verification, sign-in, sign-out, reset. Reached through the console's origin
 * only, by service binding, so the session cookie stays first-party and host-only (18 §3). The instance is built per
 * request on the request's own connection: one socket per request, closed with it.
 */
export const AuthRoutes = HttpRouter.add(
  "*",
  "/api/auth/*",
  Effect.gen(function*() {
    const auth = yield* requestAuth
    const request = yield* HttpServerRequest.toWeb(yield* HttpServerRequest.HttpServerRequest)
    return HttpServerResponse.fromWeb(yield* Effect.promise(() => auth.handler(request)))
  }).pipe(withRequestDb, Effect.withSpan("Auth.handler"))
)
