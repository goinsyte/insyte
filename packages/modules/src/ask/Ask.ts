import { Db } from "@insyte/database/Db"
import type { NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { AskRemoved, AskThread, AskThreadList } from "./domain/Ask.ts"
import * as Threads from "./use-cases/threads.ts"

type R = Db | CurrentPrincipal

/**
 * Vraag Insyte's conversations (M15 step 3): the person's own, listed, read and set aside with Undo. Asking is
 * `Answer.ts`, loaded with the model for the call that asks (ADR-0041 §3); this service loads with the RPC layer and
 * never imports the model.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class AskService extends Context.Service<AskService, {
  readonly list: (limit?: number) => Effect.Effect<AskThreadList, never, R>
  readonly get: (id: string) => Effect.Effect<AskThread, NotFound, R>
  readonly remove: (id: string) => Effect.Effect<AskRemoved, NotFound, R>
}>()("modules/AskService") {
  static readonly layer = Layer.succeed(AskService, {
    list: (limit) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Threads.list(sql, limit))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    get: (id) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Threads.get(sql, id))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    remove: (id) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Threads.remove(sql, id))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      )
  })
}

/** `Shared.undo` for `ask.restore`. */
export const restore = Threads.restore
