import { Connect } from "@insyte/database/Connect"
import { Db, makeDb } from "@insyte/database/Db"
import { Effect, Scope } from "effect"

/**
 * Provides `Db` over a connection of this request's own: opened on first use, reused after, closed when `effect`
 * ends. A Worker cannot share a socket between requests (04 §8.3), and a request that never queries opens none. The
 * RPC middleware (`WithDbLive`) and the HTTP routes both use this.
 */
export const withRequestDb = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(Effect.gen(function*() {
    const connect = yield* Connect
    const scope = yield* Effect.scope
    const connection = yield* Effect.cached(connect.open.pipe(Effect.provideService(Scope.Scope, scope)))
    return yield* Effect.provideService(effect, Db, makeDb(connection))
  }))
