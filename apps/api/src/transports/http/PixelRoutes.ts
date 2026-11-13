import { UNKNOWN_COUNTRY } from "@insyte/modules/live/domain/Sessions"
import { LiveService } from "@insyte/modules/live/Live"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { ipOf } from "../../platform/EdgeGuards.ts"
import { RateLimits } from "../../platform/RateLimits.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `POST /api/public/pixel/:storeId` (M14 step 3; api.md §4.4): the Insyte Web Pixel's events from a storefront, on the
 * API's public hostname. Unauthenticated: the store's ingest key, in the body, names the store's current pixel. It is
 * public (Shopify hands pixel settings to the browser), so it is no credential, and what holds a script back is the
 * order of the checks here:
 *
 * 1. A store id that is not one of ours' shape is a 404 before any I/O.
 * 2. The limit per IP (per /64 for IPv6, where one host has a whole block), before anything that costs.
 * 3. The body, read with a running count and cut off past 4 KB.
 * 4. The use case: the route (cached, unknown stores remembered), origin, event, key; and only then the limit per
 *    store, so a flood without the key cannot use up a store's budget and silence its real events.
 *
 * The answer allows the request's origin only when it is one of the store's storefronts (or the opaque origin of
 * Shopify's pixel sandbox), and says nothing more than its status. Cloudflare's geo for the request is the visitor's
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

/** A store id as `connect.ts` mints it: `sto_` and a TypeID's 26 characters. */
const isStoreId = (id: string) => /^sto_[0-9a-hjkmnp-tv-z]{26}$/.test(id)

/** The limiter's key for an address: an IPv6 address by its /64, which one host or tenant usually holds whole. */
const ipKey = (ip: string) => {
  if (!ip.includes(":")) return `ip:${ip}`
  const [head = "", tail = ""] = ip.split("::")
  const left = head === "" ? [] : head.split(":")
  const right = tail === "" ? [] : tail.split(":")
  const groups = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left
  return `ip6:${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`
}

/** The body as text, or `null` once it passes `max` bytes: the stream is cancelled there, never buffered whole. */
const readCapped = async (request: Request, max: number): Promise<string | null> => {
  if (request.body === null) return ""
  const reader = request.body.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
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
  if (!isStoreId(storeId)) return answer(404, null)
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return answer(413, null)

  const limits = yield* RateLimits
  const ip = limits.ipLimits ? ipOf(request.headers) : null
  if (ip !== null) {
    const taken = yield* limits.take(ipKey(ip), PER_IP.bucket, PER_IP.limit, PER_IP.windowSeconds)
    if (!taken.ok) return answer(429, null, { "retry-after": String(taken.retryAfterSeconds) })
  }

  const text = yield* Effect.promise(() => readCapped(request, MAX_BODY_BYTES).then((t) => t, () => ""))
  if (text === null) return answer(413, null)
  const body = (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return undefined
    }
  })()
  const said = yield* Effect.flatMap(
    Effect.service(LiveService),
    (live) =>
      live.ingest({
        storeId,
        origin,
        body,
        geo: geoOf(request),
        admit: (store) => limits.take(`pixel:${store}`, PER_STORE.bucket, PER_STORE.limit, PER_STORE.windowSeconds)
      })
  ).pipe(withRequestDb)
  return answer(
    said.status,
    said.allowOrigin,
    said.retryAfterSeconds === undefined ? {} : { "retry-after": String(said.retryAfterSeconds) }
  )
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
