import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { type TrashIds, TrashKinds, type TrashList, type TrashPurged, type TrashRestored } from "./domain/Trash.ts"
import * as Trash from "./use-cases/trash.ts"

type R = Db | CurrentPrincipal

/**
 * The Prullenbak (M17 step 20.1a): what was deleted in the last 30 days, put back through its own slice, or purged.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class TrashService extends Context.Service<TrashService, {
  readonly list: Effect.Effect<TrashList, Forbidden, R>
  readonly restore: (input: TrashIds) => Effect.Effect<TrashRestored, Forbidden | NotFound, R>
  readonly purge: (input: TrashIds) => Effect.Effect<TrashPurged, Forbidden | NotFound, R>
  readonly empty: Effect.Effect<TrashPurged, Forbidden, R>
}>()("modules/TrashService") {
  static readonly layer = Layer.effect(
    TrashService,
    Effect.map(Effect.service(TrashKinds), (kinds) => {
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(Effect.provideService(TrashKinds, kinds), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        list: run(Trash.list()),
        restore: (input) => run(Trash.restore(input)),
        purge: (input) => run(Trash.purge(input)),
        empty: run(Trash.empty())
      }
    })
  )
}
