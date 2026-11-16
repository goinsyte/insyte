import * as Widget from "@insyte/modules/inbox/use-cases/chat/widget"
import { Effect, Layer, Scope } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { ipOf } from "../../../platform/EdgeGuards.ts"
import { RateLimits } from "../../../platform/RateLimits.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { readCapped } from "../PixelRoutes.ts"
import { WIDGET_SCRIPT } from "./widget-script.ts"

/*
 * The website chat's widget routes (M15 step 8), on the API's public hostname under `/api/public/chat/`, loaded by
 * `../ChatRoutes.ts` on the first request. Unauthenticated: the widget's session token (`Authorization: Bearer`)
 * names one conversation in one store. In the order a request meets them:
 *
 * 1. A store id that is not one of ours' shape is a 404 before any I/O.
 * 2. The limit per IP (per /56 for IPv6, a household's or a phone's whole range), before anything that costs. Loose on
 *    reads, which a carrier's NAT puts many shoppers behind; the widget's own polling is held per session instead.
 * 3. The body, read with a running count and cut off past 4 KB.
 * 4. The use case: the store's chat is on, the Origin is one of its storefronts, the token is ours and the store's;
 *    only then the limits per session, on the store's new conversations (a minute's and a day's), and on all the
 *    store's messages, so a flood without a session cannot silence a store's shoppers.
 *
 * An answer allows the request's origin only once it is known to be the store's. Nothing a shopper wrote is logged.
 */

const MAX_BODY_BYTES = 4 * 1024
const MINUTE = 60
// Every page load opens the session (the bubble shows only once it did): many shoppers behind one carrier's NAT.
const PER_IP_SESSION = { bucket: "chat-ip-session", limit: 120, windowSeconds: MINUTE } as const
const HOUR = 3_600
const DAY = 86_400
const PER_IP_READ = { bucket: "chat-ip-read", limit: 600, windowSeconds: MINUTE } as const
const PER_IP_SEND = { bucket: "chat-ip-send", limit: 30, windowSeconds: MINUTE } as const

/** The limits the use case takes once the request is the store's and the session's (`Widget.Take`). */
const WIDGET_LIMITS: Record<Widget.WidgetLimit, { bucket: string; limit: number; windowSeconds: number }> = {
  // The panel open asks every 4 seconds: 15 a minute, and room for a tab coming back.
  "session-read": { bucket: "chat-session-read", limit: 40, windowSeconds: MINUTE },
  "session-send": { bucket: "chat-session-send", limit: 12, windowSeconds: MINUTE },
  "store-send": { bucket: "chat-store-send", limit: 600, windowSeconds: MINUTE },
  // One address's new conversations with one store: before the store's own caps, which it would otherwise use up.
  "ip-threads-hour": { bucket: "chat-ip-threads", limit: 3, windowSeconds: HOUR },
  "store-threads-minute": { bucket: "chat-store-threads", limit: 10, windowSeconds: MINUTE },
  "store-threads-day": { bucket: "chat-store-threads-day", limit: 300, windowSeconds: DAY }
}

/** An address's key: an IPv4 address as it is, an IPv6 one by its /56. */
const chatIpKey = (ip: string) => {
  if (!ip.includes(":")) return `ip:${ip}`
  const [head = "", tail = ""] = ip.split("::")
  const left = head === "" ? [] : head.split(":")
  const right = tail === "" ? [] : tail.split(":")
  const groups = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left
  const hex = groups.slice(0, 4).map((g) => g.toLowerCase().padStart(4, "0"))
  return `ip6:${hex.slice(0, 3).join(":")}:${hex[3]!.slice(0, 2)}00::/56`
}

const isStoreId = (id: string) => /^sto_[0-9a-hjkmnp-tv-z]{26}$/.test(id)
const isShop = (shop: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)

const cors = (origin: string | null): Record<string, string> =>
  origin === null
    ? {}
    : {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, if-none-match",
      "access-control-expose-headers": "etag, retry-after",
      "access-control-max-age": "7200",
      vary: "origin"
    }

const empty = (status: number, origin: string | null, extra: Record<string, string> = {}) =>
  HttpServerResponse.empty({ status, headers: { ...cors(origin), "cache-control": "no-store", ...extra } })

const json = (body: unknown, origin: string | null, extra: Record<string, string> = {}) =>
  HttpServerResponse.jsonUnsafe(body, {
    status: 200,
    headers: { ...cors(origin), "cache-control": "no-store", ...extra }
  })

const tokenOf = (request: Request) => {
  const header = request.headers.get("authorization") ?? ""
  return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null
}

/** Once over the limit: the 429, else nothing. */
const limited = (key: string | null, limit: { bucket: string; limit: number; windowSeconds: number }) =>
  Effect.gen(function*() {
    if (key === null) return undefined
    const taken = yield* (yield* RateLimits).take(key, limit.bucket, limit.limit, limit.windowSeconds)
    return taken.ok ? undefined : empty(429, null, { "retry-after": String(taken.retryAfterSeconds) })
  })

/**
 * The use case's limits, keyed on what it has verified: the session (its visitor hash, never the token's text) or the
 * store. They hold on every stage: a preview's tests come from one runner, but each from sessions and stores of its own.
 */
const takeOf = (ip: string | null) =>
  Effect.map(RateLimits, (limits): Widget.Take => (limit, key) => {
    const { bucket, limit: n, windowSeconds } = WIDGET_LIMITS[limit]
    // Per address and store: where IP limits are off (a preview) or the address is unknown, there is nothing to hold.
    if (limit === "ip-threads-hour") {
      return ip === null
        ? Effect.succeed({ ok: true, retryAfterSeconds: 0 })
        : limits.take(`chat:${key}:${ip}`, bucket, n, windowSeconds)
    }
    return limits.take(`chat:${key}`, bucket, n, windowSeconds)
  })

const ipKeyOf = (request: Request) =>
  Effect.map(RateLimits, (limits) => {
    const ip = limits.ipLimits ? ipOf(request.headers) : null
    return ip === null ? null : chatIpKey(ip)
  })

const bodyOf = (request: Request) =>
  Effect.promise(async () => {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return null
    const text = await readCapped(request, MAX_BODY_BYTES).then((t) => t, () => "")
    if (text === null) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      return undefined
    }
  })

/** A use case's answer as the response. */
const answer = (said: Widget.WidgetAnswer<unknown>) => {
  switch (said.status) {
    case 200: {
      const body = said.body as { readonly etag?: string }
      return json(said.body, said.allowOrigin, body.etag === undefined ? {} : { etag: body.etag })
    }
    case 304:
      return empty(304, said.allowOrigin)
    case 429:
      return empty(429, said.allowOrigin, { "retry-after": String(said.retryAfterSeconds) })
    default:
      return json({ error: { code: String(said.status) } }, said.allowOrigin).pipe(
        HttpServerResponse.setStatus(said.status)
      )
  }
}

const request = Effect.flatMap(HttpServerRequest.HttpServerRequest, HttpServerRequest.toWeb)

const script = Effect.succeed(
  HttpServerResponse.text(WIDGET_SCRIPT, {
    contentType: "application/javascript; charset=utf-8",
    headers: { "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" }
  })
)

const session = Effect.gen(function*() {
  const req = yield* request
  const ip = yield* ipKeyOf(req)
  const over = yield* limited(ip, PER_IP_SESSION)
  if (over !== undefined) return over
  const body = yield* bodyOf(req)
  if (body === null) return empty(413, null)
  const input = (typeof body === "object" && body !== null ? body : {}) as { shop?: unknown; storeId?: unknown }
  const storeId = typeof input.storeId === "string" && isStoreId(input.storeId) ? input.storeId : null
  const shop = typeof input.shop === "string" && isShop(input.shop) ? input.shop : null
  if (storeId === null && shop === null) return empty(404, null)
  const said = yield* Widget.open({ shop, storeId, origin: req.headers.get("origin"), token: tokenOf(req) }).pipe(
    withRequestDb
  )
  return answer(said)
}).pipe(Effect.withSpan("Chat.sessionRoute"))

const storeOf = Effect.map(HttpRouter.params, ({ storeId = "" }) => (isStoreId(storeId) ? storeId : null))

const messages = Effect.gen(function*() {
  const req = yield* request
  const storeId = yield* storeOf
  if (storeId === null) return empty(404, null)
  const over = yield* limited(yield* ipKeyOf(req), PER_IP_READ)
  if (over !== undefined) return over
  const said = yield* Widget.read({
    storeId,
    origin: req.headers.get("origin"),
    token: tokenOf(req),
    etag: req.headers.get("if-none-match"),
    take: yield* takeOf(null)
  }).pipe(withRequestDb)
  return answer(said)
}).pipe(Effect.withSpan("Chat.readRoute"))

const say = Effect.gen(function*() {
  const req = yield* request
  const storeId = yield* storeOf
  if (storeId === null) return empty(404, null)
  const ip = yield* ipKeyOf(req)
  const overIp = yield* limited(ip, PER_IP_SEND)
  if (overIp !== undefined) return overIp
  const body = yield* bodyOf(req)
  if (body === null) return empty(413, null)
  const said = yield* Widget.post({
    storeId,
    origin: req.headers.get("origin"),
    token: tokenOf(req),
    text: typeof body === "object" && body !== null ? (body as { text?: unknown }).text : undefined,
    take: yield* takeOf(ip)
  }).pipe(withRequestDb)
  return answer(said)
}).pipe(Effect.withSpan("Chat.sendRoute"))

const end = Effect.gen(function*() {
  const req = yield* request
  const storeId = yield* storeOf
  if (storeId === null) return empty(404, null)
  const over = yield* limited(yield* ipKeyOf(req), PER_IP_SEND)
  if (over !== undefined) return over
  const said = yield* Widget.close({ storeId, origin: req.headers.get("origin"), token: tokenOf(req) }).pipe(
    withRequestDb
  )
  return answer(said)
}).pipe(Effect.withSpan("Chat.closeRoute"))

/** The preflight: allowed for any origin, which the request itself checks again against the store's. */
const preflight = Effect.map(HttpServerRequest.HttpServerRequest, (r) => empty(204, r.headers["origin"] ?? null))

const Routes = Layer.mergeAll(
  HttpRouter.add("GET", "/api/public/chat/widget.js", script),
  HttpRouter.add("POST", "/api/public/chat/session", session),
  HttpRouter.add("OPTIONS", "/api/public/chat/session", preflight),
  HttpRouter.add("GET", "/api/public/chat/:storeId/messages", messages),
  HttpRouter.add("POST", "/api/public/chat/:storeId/messages", say),
  HttpRouter.add("OPTIONS", "/api/public/chat/:storeId/messages", preflight),
  HttpRouter.add("POST", "/api/public/chat/:storeId/close", end),
  HttpRouter.add("OPTIONS", "/api/public/chat/:storeId/close", preflight)
)

/** The routes as one handler, built when this module loads, once per isolate (as `dev/Routes.ts`). */
export const handler = Effect.runSync(
  HttpRouter.toHttpEffect(Routes).pipe(Effect.provideService(Scope.Scope, Scope.makeUnsafe()))
)
