import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import type { handler } from "./dev/Routes.ts"
import { devOnly } from "./dev/shared.ts"
import { isRouteNotFound, notFound } from "./NotFound.ts"

/** The `__dev` routes' handler, once loaded. */
let routes: Promise<typeof handler> | undefined

/**
 * The `__dev` routes (`dev/`): for the worker tests, the e2e journey and a person trying a preview. One route takes
 * their prefix and loads them on the first request, so an isolate that serves none never evaluates them (ADR-0041).
 * Only where nothing real lives (`devOnly`): on staging and in production every path under the prefix is the same 404
 * as a path no route claims, before any of them loads, so a new dev route cannot forget to refuse. A path under it
 * that none of them has is that 404 too.
 */
export const DevRoutes = HttpRouter.add(
  "*",
  "/api/__dev/*",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return notFound()
    const handle = yield* Effect.promise(() => (routes ??= import("./dev/Routes.ts").then((dev) => dev.handler)))
    return yield* handle
  }).pipe(Effect.catchIf(isRouteNotFound, () => Effect.succeed(notFound())))
)
