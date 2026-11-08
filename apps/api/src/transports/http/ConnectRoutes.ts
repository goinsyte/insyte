import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { StoresService } from "@insyte/modules/stores/Stores"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"
import { CALLBACK_PATH } from "../rpc/handlers/stores.ts"

/*
 * `GET /api/connect/shopify/callback` (M6.2): Shopify's way back after the operator approved the app, on the console's
 * origin so the session cookie names them. The use case checks everything; this answers with a redirect to where the
 * flow began, saying what happened in the query (`connected=shopify` or `error=<reason>`).
 */

const back = (path: string, params: Record<string, string>) => {
  const url = new URL(path, "http://console")
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return HttpServerResponse.redirect(`${url.pathname}${url.search}`, { status: 302 })
}

export const ConnectRoutes = HttpRouter.add(
  "GET",
  CALLBACK_PATH,
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = Object.fromEntries(new URL(request.url, "http://api").searchParams)
    const user = yield* userFrom(new Headers(request.headers as Record<string, string>))
    if (Option.isNone(user)) return back("/login", { redirect: "/settings/stores" })
    const [active] = yield* Effect.flatMap(Effect.service(Workspaces), (w) => w.memberships).pipe(
      Effect.provideService(CurrentUser, user.value),
      Effect.provide(Workspaces.layer)
    )
    if (active === undefined) return back("/onboarding", {})
    return yield* Effect.flatMap(Effect.service(StoresService), (stores) => stores.callback(query)).pipe(
      Effect.map((connected) => back(connected.returnPath, { connected: "shopify", store: connected.storeId })),
      Effect.catchTags({
        StoreConnectedElsewhere: () => Effect.succeed(back("/settings/stores", { error: "elsewhere" })),
        ConnectFailed: (e) => Effect.succeed(back("/settings/stores", { error: e.reason }))
      }),
      Effect.provideService(CurrentPrincipal, active.principal)
    )
  }).pipe(withRequestDb, Effect.withSpan("Stores.callbackRoute"))
)
