import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AppInfo } from "../../../platform/Bindings.ts"

/**
 * `GET /api/__dev/billing/checkouts?workspace=<id>`: the Checkout pages Stripe's fake opened for one workspace, with
 * their status (open, complete, expired) and the change each was opened for, for the worker tests: that a workspace
 * never has two pages it can pay. Refused in production; empty where the fake is not the adapter.
 */
export const BillingCheckouts = HttpRouter.add(
  "GET",
  "/api/__dev/billing/checkouts",
  Effect.gen(function*() {
    const { environment } = yield* AppInfo
    if (environment === "production") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const workspace = new URL(request.url, "http://local").searchParams.get("workspace") ?? ""
    const { fakeCheckouts } = yield* Effect.promise(() => import("@insyte/integrations-stripe/StripeFake"))
    return HttpServerResponse.jsonUnsafe({ checkouts: fakeCheckouts(workspace) })
  })
)
