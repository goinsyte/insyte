import { PortalService } from "@insyte/modules/returns/Portal"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { ipOf } from "../../platform/EdgeGuards.ts"
import { ipKey, LIMITS, orderKey, takeAll } from "../../platform/PortalGuards.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `PUT /api/portal/photos` (M9.3): one photo for a returns portal request, before the request exists. The body is the
 * image; the portal's token rides in `x-portal-token` and the file's name in `x-file-name`. Through the console's
 * origin, like the portal's calls. The declared size is refused unread past ten megabytes; the rest is the use case's.
 */

const MAX_BYTES = 10 * 1024 * 1024

const refusal = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  HttpServerResponse.jsonUnsafe({ error: { code, ...extra } }, { status })

export const PortalRoutes = HttpRouter.add(
  "PUT",
  "/api/portal/photos",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const headers = new Headers(request.headers as Record<string, string>)
    if (Number(headers.get("content-length") ?? 0) > MAX_BYTES) return refusal(413, "too_large")
    const portal = yield* PortalService
    const token = headers.get("x-portal-token") ?? ""
    return yield* Effect.gen(function*() {
      const orderId = yield* portal.orderOf(token)
      yield* takeAll([
        [orderKey(orderId), LIMITS.photoPerOrder],
        [yield* ipKey(ipOf(headers)), LIMITS.photoPerIp]
      ])
      const bytes = new Uint8Array(yield* Effect.orDie(request.arrayBuffer))
      if (bytes.byteLength > MAX_BYTES) return refusal(413, "too_large")
      const name = (() => {
        try {
          return decodeURIComponent(headers.get("x-file-name") ?? "")
        } catch {
          return ""
        }
      })()
      const { id } = yield* portal.upload({ token, name, mime: headers.get("content-type") ?? "", bytes })
      return HttpServerResponse.jsonUnsafe({ id }, { status: 201 })
    }).pipe(
      Effect.catchTags({
        PortalTokenExpired: () => Effect.succeed(refusal(401, "token_expired")),
        PortalRateLimited: (e) =>
          Effect.succeed(refusal(429, "rate_limited", { retryAfterSeconds: e.retryAfterSeconds })),
        Invalid: (e) =>
          Effect.succeed(
            e.fields["file"] === "type"
              ? refusal(415, "unsupported_type")
              : refusal(422, "invalid", { fields: e.fields })
          )
      })
    )
  }).pipe(withRequestDb, Effect.withSpan("Portal.photoRoute"))
)
