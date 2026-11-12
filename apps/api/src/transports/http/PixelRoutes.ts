import { UNKNOWN_COUNTRY } from "@insyte/modules/live/domain/Sessions"
import { LiveService } from "@insyte/modules/live/Live"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { ipOf } from "../../platform/EdgeGuards.ts"
import { RateLimits } from "../../platform/RateLimits.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `POST /api/public/pixel/:storeId` (M14 step 3; api.md §4.4): the Insyte Web Pixel's events from a storefront, on the
 * API's public hostname. Unauthenticated: the store's ingest key, in the body, is the credential. In front of the use
 * case: a 4 KB body cap, and the `RateLimiter` per store and per IP, so a script cannot fill a room or spend the
 * database. The answer allows the request's origin only when it is one of the store's storefronts (or the opaque origin
 * of Shopify's pixel sandbox), and says nothing more than its status. Cloudflare's geo for the request is the visitor's
 * city; the IP itself is only a rate-limit key and goes no further.
 *
 * The pixel posts `text/plain` (a simple request, no preflight); a preflight is answered anyway, for a client that
 * sends JSON.
 */

const MAX_BODY_BYTES = 4 * 1024
const MINUTE = 60
/** A busy store's whole traffic, and one visitor's (a page view every second is already a lot). */
const PER_STORE = { bucket: "pixel-store", limit: 6000, windowSeconds: MINUTE } as const
const PER_IP = { bucket: "pixel-ip", limit: 120, windowSeconds: MINUTE } as const

const cors = (origin: string | null): Record<string, string> =>
  origin === null
    ? {}
    : {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
      vary: "origin"
    }

const answer = (status: number, origin: string | null, extra: Record<string, string> = {}) =>
  HttpServerResponse.empty({ status, headers: { ...cors(origin), ...extra } })

/** Cloudflare's reading of where the request came from; absent outside Cloudflare (the worker tests, local dev). */
const geoOf = (request: Request) => {
  const cf = (request as Request & { readonly cf?: Record<string, unknown> }).cf
  const text = (key: string) => (typeof cf?.[key] === "string" ? (cf[key] as string) : "")
  const number = (key: string) => {
    const n = Number(cf?.[key])
    return Number.isFinite(n) ? n : 0
  }
  return {
    city: text("city"),
    country: text("country").toUpperCase() || UNKNOWN_COUNTRY,
    lon: number("longitude"),
    lat: number("latitude")
  }
}

const ingest = Effect.gen(function*() {
  const request = yield* HttpServerRequest.toWeb(yield* HttpServerRequest.HttpServerRequest)
  const { storeId = "" } = yield* HttpRouter.params
  const origin = request.headers.get("origin")
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return answer(413, null)

  const limits = yield* RateLimits
  const ip = limits.ipLimits ? ipOf(request.headers) : null
  for (const [key, limit] of [[`pixel:${storeId}`, PER_STORE], [ip === null ? null : `ip:${ip}`, PER_IP]] as const) {
    if (key === null) continue
    const taken = yield* limits.take(key, limit.bucket, limit.limit, limit.windowSeconds)
    if (!taken.ok) return answer(429, null, { "retry-after": String(taken.retryAfterSeconds) })
  }

  const text = yield* Effect.promise(() => request.text().then((t) => t, () => ""))
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return answer(413, null)
  const body = (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return undefined
    }
  })()
  const said = yield* Effect.flatMap(
    Effect.service(LiveService),
    (live) => live.ingest({ storeId, origin, body, geo: geoOf(request) })
  ).pipe(withRequestDb)
  return answer(said.status, said.allowOrigin)
}).pipe(Effect.withSpan("Live.pixelRoute"))

/** The preflight: allowed for any origin the store's pixel row names, which the POST checks again. */
const preflight = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const origin = request.headers["origin"] ?? null
  return answer(204, origin)
})

export const PixelRoutes = Layer.mergeAll(
  HttpRouter.add("POST", "/api/public/pixel/:storeId", ingest),
  HttpRouter.add("OPTIONS", "/api/public/pixel/:storeId", preflight)
)
