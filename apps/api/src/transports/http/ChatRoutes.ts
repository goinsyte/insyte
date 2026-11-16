import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import type { handler } from "./chat/Routes.ts"
import { isRouteNotFound, notFound } from "./NotFound.ts"

/** The website chat's routes' handler, once loaded. */
let routes: Promise<typeof handler> | undefined

/**
 * The website chat's widget routes (M15 step 8; `chat/Routes.ts`): one route takes their prefix and loads them on the
 * first request, so an isolate that serves no storefront never evaluates them (ADR-0041). A path under it that none of
 * them has is the same 404 as a path no route claims.
 */
export const ChatRoutes = HttpRouter.add(
  "*",
  "/api/public/chat/*",
  Effect.gen(function*() {
    const handle = yield* Effect.promise(() => (routes ??= import("./chat/Routes.ts").then((chat) => chat.handler)))
    return yield* handle
  }).pipe(Effect.catchIf(isRouteNotFound, () => Effect.succeed(notFound())))
)
