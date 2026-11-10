import { normaliseNumber, PortalRateLimited } from "@insyte/modules/returns/domain/Portal"
import { Effect } from "effect"
import { RateLimits } from "./RateLimits.ts"

/*
 * The returns portal's limits (M9.3), in the `RateLimiter` Durable Object like the auth routes': finding an order per IP
 * and per order number, a request and photos per order. A shopper finds their order once or twice; a script trying
 * numbers and addresses meets the limit, and Turnstile, long before it finds one. A refusal says how long to wait,
 * never whether an order exists.
 */

const MINUTE = 60
const HOUR = 60 * MINUTE

interface Limit {
  readonly bucket: string
  readonly limit: number
  readonly windowSeconds: number
}

export const LIMITS = {
  lookupPerIp: { bucket: "portal-lookup", limit: 20, windowSeconds: 15 * MINUTE },
  lookupPerOrder: { bucket: "portal-lookup", limit: 10, windowSeconds: HOUR },
  startPerOrder: { bucket: "portal-start", limit: 10, windowSeconds: HOUR },
  startPerIp: { bucket: "portal-start", limit: 30, windowSeconds: HOUR },
  photoPerOrder: { bucket: "portal-photo", limit: 30, windowSeconds: HOUR },
  photoPerIp: { bucket: "portal-photo", limit: 60, windowSeconds: HOUR }
} as const satisfies Record<string, Limit>

/** One attempt against each limit that has a key; the first one full refuses. */
export const takeAll = Effect.fn("PortalGuards.take")(function*(
  takes: ReadonlyArray<readonly [key: string | null, limit: Limit]>
) {
  const limits = yield* RateLimits
  for (const [key, limit] of takes) {
    if (key === null) continue
    const taken = yield* limits.take(key, limit.bucket, limit.limit, limit.windowSeconds)
    if (!taken.ok) return yield* new PortalRateLimited({ retryAfterSeconds: taken.retryAfterSeconds })
  }
})

/** The keys: an IP where the stage counts IPs, an order by its handle and number, an order by its id. */
export const ipKey = (ip: string | null) =>
  Effect.map(Effect.service(RateLimits), (limits) => (limits.ipLimits && ip !== null ? `ip:${ip}` : null))
export const numberKey = (handle: string, number: string) => `portal:${handle}:${normaliseNumber(number)}`
export const orderKey = (orderId: string) => `portal-order:${orderId}`
