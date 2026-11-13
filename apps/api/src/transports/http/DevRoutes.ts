import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import type { handler } from "./dev/Routes.ts"
import { isRouteNotFound, notFound } from "./NotFound.ts"

/** The `__dev` routes' handler, once loaded. */
let routes: Promise<typeof handler> | undefined

/**
 * The `__dev` routes (`dev/`): for the worker tests, the e2e journey and a person trying a preview; each refuses
 * production itself. One route takes their prefix and loads them on the first request, so an isolate that serves none
 * never evaluates them (ADR-0041). A path
 * under it that none of them has is the same 404 as anywhere else.
 */
export const DevRoutes = HttpRouter.add(
  "*",
  "/api/__dev/*",
  Effect.promise(() => (routes ??= import("./dev/Routes.ts").then((dev) => dev.handler))).pipe(
    Effect.flatten,
    Effect.catchIf(isRouteNotFound, () => Effect.succeed(notFound()))
  )
)
