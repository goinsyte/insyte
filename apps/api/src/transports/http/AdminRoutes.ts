import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import type { handler } from "./admin/Routes.ts"
import { isRouteNotFound, notFound } from "./NotFound.ts"

/** The staff admin's handler, once loaded. */
let routes: Promise<typeof handler> | undefined

const load = Effect.gen(function*() {
  const handle = yield* Effect.promise(() => (routes ??= import("./admin/Routes.ts").then((admin) =>
    admin.handler
  ).catch((error: unknown) => {
    routes = undefined
    throw error
  })))
  return yield* handle
}).pipe(Effect.catchIf(isRouteNotFound, () => Effect.succeed(notFound())))

/**
 * The staff admin (M18, Support; `admin/`): Insyte's team finding a workspace, its health, and looking along
 * read-only with the owner's consent. The prefix's route (which also takes `/api/__admin` itself) loads it on the
 * first request, so an isolate that serves
 * none never evaluates it (ADR-0041). Every path under the prefix passes the gate first (`admin/Gate.ts`: Cloudflare
 * Access's JWT, verified, and the staff allowlist), inside the loaded module, so a route added there cannot forget it.
 */
export const AdminRoutes = HttpRouter.add("*", "/api/__admin/*", load)
