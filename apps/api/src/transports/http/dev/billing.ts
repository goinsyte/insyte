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

/**
 * `POST /api/__dev/billing/end-fails?workspace=<id>&reason=unreachable|refused|none`: the fake will not end that
 * workspace's subscription (Stripe not answering, or saying no) until told `none`, for the worker tests of a deletion
 * whose billing step fails. Refused in production; nothing to change where the fake is not the adapter.
 */
export const BillingEndFails = HttpRouter.add(
  "POST",
  "/api/__dev/billing/end-fails",
  Effect.gen(function*() {
    const { environment } = yield* AppInfo
    if (environment === "production") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const params = new URL(request.url, "http://local").searchParams
    const workspace = params.get("workspace") ?? ""
    const reason = params.get("reason")
    const { fakeEndFails } = yield* Effect.promise(() => import("@insyte/integrations-stripe/StripeFake"))
    fakeEndFails(workspace, reason === "unreachable" || reason === "refused" ? reason : null)
    return HttpServerResponse.jsonUnsafe({ ok: true })
  })
)
