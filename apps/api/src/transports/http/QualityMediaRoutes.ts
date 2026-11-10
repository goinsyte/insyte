import { QualityLinkService } from "@insyte/modules/quality/Quality"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { ipOf } from "../../platform/EdgeGuards.ts"
import { checkKey, ipKey, LIMITS, takeAll } from "../../platform/PortalGuards.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `PUT /api/quality/media` (M9.4): one photo or video for a supplier's answer to a quality check, before it is sent.
 * The body is the file; the link's token rides in `x-check-token` and the file's name in `x-file-name`. Through the
 * console's origin. The declared size is refused unread past fifty megabytes; the rest is the use case's.
 */

const MAX_BYTES = 50 * 1024 * 1024

const refusal = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  HttpServerResponse.jsonUnsafe({ error: { code, ...extra } }, { status })

export const QualityMediaRoutes = HttpRouter.add(
  "PUT",
  "/api/quality/media",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const headers = new Headers(request.headers as Record<string, string>)
    if (Number(headers.get("content-length") ?? 0) > MAX_BYTES) return refusal(413, "too_large")
    const link = yield* QualityLinkService
    const token = headers.get("x-check-token") ?? ""
    return yield* Effect.gen(function*() {
      const checkId = yield* link.checkOf(token)
      yield* takeAll([[checkKey(checkId), LIMITS.mediaPerCheck], [yield* ipKey(ipOf(headers)), LIMITS.photoPerIp]])
      const bytes = new Uint8Array(yield* Effect.orDie(request.arrayBuffer))
      if (bytes.byteLength > MAX_BYTES) return refusal(413, "too_large")
      const name = (() => {
        try {
          return decodeURIComponent(headers.get("x-file-name") ?? "")
        } catch {
          return ""
        }
      })()
      const { id } = yield* link.upload({ token, name, mime: headers.get("content-type") ?? "", bytes })
      return HttpServerResponse.jsonUnsafe({ id }, { status: 201 })
    }).pipe(
      Effect.catchTags({
        LinkExpired: () => Effect.succeed(refusal(401, "link_expired")),
        IllegalCheckMove: () => Effect.succeed(refusal(409, "not_open")),
        PortalRateLimited: (e) =>
          Effect.succeed(refusal(429, "rate_limited", { retryAfterSeconds: e.retryAfterSeconds })),
        Invalid: (e) =>
          Effect.succeed(
            e.fields["file"] === "type"
              ? refusal(415, "unsupported_type")
              : e.fields["file"] === "size"
              ? refusal(413, "too_large")
              : refusal(422, "invalid", { fields: e.fields })
          )
      })
    )
  }).pipe(withRequestDb, Effect.withSpan("Quality.mediaRoute"))
)
