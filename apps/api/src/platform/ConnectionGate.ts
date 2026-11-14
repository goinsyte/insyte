import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import {
  ConnectionGate,
  ShopifyThrottled,
  type ThrottleStatus,
  TokenRefused
} from "@insyte/modules/stores/domain/Ports"
import { accessToken } from "@insyte/modules/stores/use-cases/token"
import { DurableObject, env } from "cloudflare:workers"
import { Cause, Effect, Exit, Layer, ManagedRuntime, Redacted, Scheduler } from "effect"
import { FetchHttpClient } from "effect/http"
import { AppInfo, ConfigLive } from "./Bindings.ts"
import { HyperdriveConnect } from "./Hyperdrive.ts"
import { ObservabilityLive, Telemetry } from "./Observability.ts"
import { withRequestDb } from "./RequestDb.ts"
import { SealerLive } from "./Seal.ts"
import { ShopifyAdminChoice } from "./Shopify.ts"

/*
 * The gate (integrations.md §1.3): one Durable Object per external account, `CONNECTION_GATE` by connection id, which
 * every call for that account passes. A Durable Object runs one instance per name, so the refresh is single-flight by
 * construction: callers that arrive while it runs wait for the same answer, and Shopify's rotating refresh token is
 * spent once. The bucket starts at twenty seconds of the restore rate and learns the real size from the first answer.
 * The token lives in memory only; on eviction the next caller reads it again from the sealed credentials.
 */

/** One shape, not a union, over the Durable Object's RPC: a token, or why there is none. */
interface TokenAnswer {
  readonly token: string | null
  readonly until: number | null
  readonly refused: "disconnected" | "expired" | null
}

interface Bucket {
  available: number
  max: number
  restore: number
  at: number
}

/** The gate's own runtime: the token's use case and what it needs, no routes. Built once per isolate, on first use. */
let runtime: ManagedRuntime.ManagedRuntime<unknown, unknown> | undefined
const gateRuntime = () => (runtime ??= ManagedRuntime.make(
  Layer.mergeAll(SealerLive, ShopifyAdminChoice).pipe(
    Layer.provideMerge(HyperdriveConnect),
    Layer.provideMerge(ObservabilityLive),
    Layer.provideMerge(AppInfo.layer),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(ConfigLive),
    Layer.provideMerge(Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync")))
  )
) as ManagedRuntime.ManagedRuntime<unknown, unknown>)

export class ConnectionGateObject extends DurableObject<Cloudflare.Env> {
  #token: { readonly token: string; readonly until: number | null } | undefined
  #pending: Promise<TokenAnswer> | undefined
  #bucket: Bucket = { available: 2000, max: 2000, restore: 100, at: Date.now() }

  /** A valid access token; at most one refresh in flight, whoever asks. */
  async accessToken(workspaceId: string, connectionId: string): Promise<TokenAnswer> {
    const held = this.#token
    if (held !== undefined && (held.until === null || held.until > Date.now())) return { ...held, refused: null }
    this.#pending ??= this.#read(workspaceId, connectionId).finally(() => {
      this.#pending = undefined
    })
    return this.#pending
  }

  /** Drops the held token: the next caller reads it again (after a 401, or a reconnect). */
  async forget(): Promise<void> {
    this.#token = undefined
  }

  /** Takes `cost` points from the bucket: `0` when they were there, else how long until they will be. */
  async reserve(cost: number): Promise<number> {
    const bucket = this.#refilled()
    if (bucket.available >= cost) {
      bucket.available -= cost
      return 0
    }
    return Math.ceil(((cost - bucket.available) / bucket.restore) * 1000)
  }

  /** What the vendor said the bucket holds after a call: it overrides the estimate, even on a refused call. */
  async observe(status: ThrottleStatus): Promise<void> {
    this.#bucket = {
      available: status.currentlyAvailable,
      max: status.maximumAvailable,
      restore: status.restoreRate,
      at: Date.now()
    }
  }

  #refilled(): Bucket {
    const now = Date.now()
    const bucket = this.#bucket
    bucket.available = Math.min(bucket.max, bucket.available + ((now - bucket.at) / 1000) * bucket.restore)
    bucket.at = now
    return bucket
  }

  async #read(workspaceId: string, connectionId: string): Promise<TokenAnswer> {
    const program = withRequestDb(accessToken(connectionId)).pipe(
      Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId })
    )
    // The call's own spans, sent before it answers (`Observability.ts`).
    const exit = await Telemetry.runExit(
      gateRuntime(),
      program as Effect.Effect<Effect.Success<typeof program>, unknown>
    )
    if (Exit.isSuccess(exit)) {
      this.#token = { token: Redacted.value(exit.value.token), until: exit.value.until }
      return { ...this.#token, refused: null }
    }
    const failure = Cause.findErrorOption(exit.cause)
    if (failure._tag === "Some" && failure.value instanceof TokenRefused) {
      return { token: null, until: null, refused: failure.value.reason }
    }
    throw Cause.squash(exit.cause)
  }
}

/** How long a caller sleeps inline for the bucket; beyond it the step fails `ShopifyThrottled` and retries later. */
const INLINE_WAIT_MS = 2000

const gateOf = (connectionId: string) => env.CONNECTION_GATE.getByName(connectionId)

export const ConnectionGateLive = Layer.succeed(ConnectionGate)(ConnectionGate.of({
  accessToken: Effect.fn("Gate.accessToken")(function*(connectionId: string) {
    const workspace = yield* CurrentWorkspace
    const answer = yield* Effect.promise(() => gateOf(connectionId).accessToken(workspace.id, connectionId))
    if (answer.token === null) return yield* new TokenRefused({ reason: answer.refused ?? "disconnected" })
    return Redacted.make(answer.token)
  }),
  reserve: Effect.fn("Gate.reserve")(function*(connectionId: string, cost: number) {
    for (;;) {
      const wait = yield* Effect.promise(() => gateOf(connectionId).reserve(cost))
      if (wait === 0) return
      if (wait > INLINE_WAIT_MS) return yield* new ShopifyThrottled({ retryAfterMs: wait })
      yield* Effect.sleep(wait)
    }
  }),
  observe: (connectionId, status) => Effect.promise(() => gateOf(connectionId).observe(status)),
  forget: (connectionId) => Effect.promise(() => gateOf(connectionId).forget())
}))
