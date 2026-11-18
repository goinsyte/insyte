import { click } from "@insyte/modules/affiliates/use-cases/click"
import { env } from "cloudflare:workers"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { RateLimits } from "../../../platform/RateLimits.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"

/*
 * An affiliate's short link (M16 step 4): the click counted, and a 302 to the store's own page with the link's tags
 * and `insyte_ref` (the storefront keeps it on the cart; the order carries it back). Never an open redirect: the
 * target is the store's own address and the link's own path, read from the database by the slug alone; nothing in
 * the request takes part in it. An unknown slug is a 404. Clicks are limited per address (60 a minute), and the address
 * and the browser are kept only as keyed hashes of the day, so two days' clicks are never linked.
 */

const PER_IP = { bucket: "affiliate-click", limit: 60, windowSeconds: 60 }

const notFound = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, {
  status: 404,
  headers: { "cache-control": "no-store" }
})

/** The address as the limiter's key: IPv6 by its /64. */
const ipKey = (ip: string) =>
  ip.includes(":") ? `ip6:${ip.split(":").slice(0, 4).join(":").toLowerCase()}::/64` : `ip:${ip}`

const encoder = new TextEncoder()
let hashKey: Promise<CryptoKey | null> | undefined

/** HMAC key for the clicks' hashes, derived from the stage's auth secret: no address is kept as it came. */
const keyOf = () =>
  hashKey ??= (async () => {
    const root = (env as { readonly BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET ?? ""
    if (root === "") return null
    const base = await crypto.subtle.importKey("raw", encoder.encode(root), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign"
    ])
    const derived = await crypto.subtle.sign("HMAC", base, encoder.encode("insyte affiliate clicks v1"))
    return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  })()

const hashOf = async (day: string, value: string | null) => {
  const key = await keyOf()
  if (key === null || value === null || value === "") return null
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${day}|${value}`)))
}

export const redirect = Effect.gen(function*() {
  const request = yield* HttpServerRequest.toWeb(yield* HttpServerRequest.HttpServerRequest)
  const { slug = "" } = yield* HttpRouter.params
  if (!/^[a-z0-9]{8,16}$/.test(slug)) return notFound
  const ip = request.headers.get("cf-connecting-ip")
  const limits = yield* RateLimits
  if (limits.ipLimits && ip !== null && ip !== "") {
    const taken = yield* limits.take(ipKey(ip), PER_IP.bucket, PER_IP.limit, PER_IP.windowSeconds)
    if (!taken.ok) {
      return HttpServerResponse.empty({
        status: 429,
        headers: { "retry-after": String(taken.retryAfterSeconds), "cache-control": "no-store" }
      })
    }
  }
  const day = new Date().toISOString().slice(0, 10)
  const [ipHash, uaHash] = yield* Effect.promise(() =>
    Promise.all([hashOf(day, ip), hashOf(day, request.headers.get("user-agent")?.slice(0, 512) ?? null)])
  )
  const cf = (request as Request & { readonly cf?: { readonly country?: unknown } }).cf
  const country = typeof cf?.country === "string" && /^[A-Z]{2}$/.test(cf.country) ? cf.country : null
  const landing = yield* withRequestDb(click({ slug, ipHash, uaHash, country }))
  if (landing === undefined) return notFound
  return HttpServerResponse.empty({
    status: 302,
    headers: { location: landing.location, "cache-control": "no-store", "referrer-policy": "no-referrer" }
  })
})
