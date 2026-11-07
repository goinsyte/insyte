import { Effect } from "effect"
import { RateLimits } from "./RateLimits.ts"

/*
 * What stands in front of better-auth's routes (12 §3, M2.3): a body cap, and rate limits per IP and per address in the
 * `RateLimiter` Durable Object. better-auth's own limiter is off (`rateLimit.enabled: false`): it keys by IP and path
 * only, per isolate. Turnstile and the beta gate join here in step 1.4b.
 *
 * A refusal is better-auth's error shape with our code, `RATE_LIMITED`, and the seconds to wait, which the console turns
 * into "Te veel pogingen. Probeer het over n minuten opnieuw." The same answer whether or not the address has an
 * account: a limit never tells anyone which addresses exist.
 */

const MAX_BODY_BYTES = 16 * 1024
const MINUTE = 60
const HOUR = 60 * MINUTE

/** Sign-in per address: 5 failures in 15 minutes lock it for 15 minutes, then 30, 60… (exponential cool-down). */
const SIGN_IN_LOCK = { threshold: 5, windowSeconds: 15 * MINUTE, baseSeconds: 15 * MINUTE } as const

type Bucket = {
  readonly name: string
  readonly limit: number
  readonly windowSeconds: number
  readonly by: "ip" | "email"
}

/** The fixed-window limits per route, as M2.3 lists them. */
const BUCKETS: Record<string, ReadonlyArray<Bucket>> = {
  "/api/auth/sign-in/email": [{ name: "sign-in", limit: 20, windowSeconds: 15 * MINUTE, by: "ip" }],
  "/api/auth/sign-up/email": [{ name: "sign-up", limit: 10, windowSeconds: HOUR, by: "ip" }],
  "/api/auth/request-password-reset": [{ name: "reset", limit: 3, windowSeconds: HOUR, by: "email" }],
  "/api/auth/send-verification-email": [{ name: "verify", limit: 3, windowSeconds: HOUR, by: "email" }]
}

const refusal = (status: number, code: string, message: string, retryAfterSeconds?: number) =>
  new Response(JSON.stringify({ code, message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) }), {
    status,
    headers: {
      "content-type": "application/json",
      ...(retryAfterSeconds === undefined ? {} : { "retry-after": String(retryAfterSeconds) })
    }
  })

const limited = (retryAfterSeconds: number) =>
  refusal(429, "RATE_LIMITED", "Too many attempts. Try again later.", retryAfterSeconds)

/** An address as a key: normalised, then hashed, so no address is ever a Durable Object's name. */
const emailKey = async (email: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()))
  return `email:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`
}

/** A POST body, read from a copy so better-auth still gets the stream; `undefined` past the cap. */
const bodyOf = (request: Request): Effect.Effect<string | undefined> =>
  Effect.promise(() => request.clone().text().then((text) => text, () => "")).pipe(
    Effect.map((text) => new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES ? undefined : text)
  )

/** The address a JSON body names, if it names one. */
const emailIn = (body: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(body)
    const email = typeof parsed === "object" && parsed !== null ? (parsed as { email?: unknown }).email : undefined
    return typeof email === "string" ? email : undefined
  } catch {
    return undefined
  }
}

export const guarded = <E, R>(
  request: Request,
  handle: (request: Request) => Effect.Effect<Response, E, R>
): Effect.Effect<Response, E, R | RateLimits> =>
  Effect.gen(function*() {
    if (request.method !== "POST") return yield* handle(request)
    // The declared length first, so an oversized upload is refused unread; then the body itself, which may not declare.
    const tooLarge = refusal(413, "BODY_TOO_LARGE", "Request body too large.")
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge
    const body = yield* bodyOf(request)
    if (body === undefined) return tooLarge
    const path = new URL(request.url).pathname
    const buckets = BUCKETS[path]
    if (buckets === undefined) return yield* handle(request)

    const limits = yield* RateLimits
    // Cloudflare sets it on every request from outside; absent only in local development, where IP limits are skipped.
    const ip = request.headers.get("cf-connecting-ip")
    const email = emailIn(body)
    const addressKey = email === undefined ? undefined : yield* Effect.promise(() => emailKey(email))

    for (const bucket of buckets) {
      const key = bucket.by === "ip" ? (ip === null ? undefined : `ip:${ip}`) : addressKey
      if (key === undefined) continue
      const taken = yield* limits.take(key, bucket.name, bucket.limit, bucket.windowSeconds)
      if (!taken.ok) return limited(taken.retryAfterSeconds)
    }

    const signIn = path === "/api/auth/sign-in/email" && addressKey !== undefined
    if (signIn) {
      const lock = yield* limits.lockedFor(addressKey)
      if (lock.seconds > 0) return limited(lock.seconds)
    }

    const response = yield* handle(request)
    if (signIn && response.status === 401) {
      yield* limits.fail(addressKey, SIGN_IN_LOCK.threshold, SIGN_IN_LOCK.windowSeconds, SIGN_IN_LOCK.baseSeconds)
    }
    if (signIn && response.ok) yield* limits.clear(addressKey)
    return response
  }).pipe(Effect.withSpan("EdgeGuards"))
