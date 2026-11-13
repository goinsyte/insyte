import { Effect } from "effect"
import { HttpRouter, HttpServerError, HttpServerResponse } from "effect/http"

export const isRouteNotFound = (error: unknown): error is HttpServerError.HttpServerError =>
  HttpServerError.isHttpServerError(error) && error.reason._tag === "RouteNotFound"

/** The 404 a path no route claims gets (and one under `/api/__dev/` that no dev route has, `DevRoutes.ts`). */
export const notFound = () => HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })

/** A path no route claims answers 404 with the JSON envelope every client parses, not an empty body. */
export const NotFound = HttpRouter.middleware<{ handles: HttpServerError.HttpServerError }>()(
  (httpEffect) => httpEffect.pipe(Effect.catchIf(isRouteNotFound, () => Effect.succeed(notFound()))),
  { global: true }
)
