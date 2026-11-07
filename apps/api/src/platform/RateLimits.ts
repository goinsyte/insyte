import { env } from "cloudflare:workers"
import { Context, Effect, Layer } from "effect"
import type { Taken } from "./RateLimiter.ts"

/*
 * The `RateLimiter` Durable Object as an Effect service: one instance per key. The binding is read per call, never at
 * layer build (module scope allows no I/O). A limiter that cannot be reached fails open, logged: an outage of the
 * counter must not lock everyone out of signing in, and better-auth's own checks still run behind it.
 */

export class RateLimits extends Context.Service<RateLimits, {
  readonly take: (key: string, bucket: string, limit: number, windowSeconds: number) => Effect.Effect<Taken>
  readonly peek: (key: string, bucket: string, windowSeconds: number) => Effect.Effect<number>
  readonly lockedFor: (key: string) => Effect.Effect<{ readonly seconds: number; readonly failures: number }>
  readonly fail: (key: string, threshold: number, windowSeconds: number, baseSeconds: number) => Effect.Effect<number>
  readonly clear: (key: string) => Effect.Effect<void>
}>()("api-worker/RateLimits") {
  static readonly layer = Layer.succeed(this, {
    take: (key, bucket, limit, windowSeconds) =>
      call<Taken>(
        "take",
        { ok: true, retryAfterSeconds: 0 },
        () => env.RATE_LIMITER.getByName(key).take(bucket, limit, windowSeconds)
      ),
    peek: (key, bucket, windowSeconds) =>
      call("peek", 0, () => env.RATE_LIMITER.getByName(key).peek(bucket, windowSeconds)),
    lockedFor: (key) =>
      call<{ seconds: number; failures: number }>(
        "lockedFor",
        { seconds: 0, failures: 0 },
        () => env.RATE_LIMITER.getByName(key).lockedFor()
      ),
    fail: (key, threshold, windowSeconds, baseSeconds) =>
      call("fail", 0, () => env.RATE_LIMITER.getByName(key).fail(threshold, windowSeconds, baseSeconds)),
    clear: (key) => call("clear", undefined, () => env.RATE_LIMITER.getByName(key).clear())
  })
}

/** An RPC to the instance. Its results are typed `T & Disposable`; plain values are all that is read from them. */
const call = <A>(name: string, open: A, run: () => Promise<A>): Effect.Effect<A> =>
  Effect.tryPromise(run).pipe(
    Effect.catch((error) => Effect.as(Effect.logWarning(`rate limiter ${name} failed open: ${String(error)}`), open)),
    Effect.withSpan(`RateLimits.${name}`)
  )
