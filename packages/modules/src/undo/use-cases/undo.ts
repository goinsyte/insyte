import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { UndoCompensations } from "../domain/Ports.ts"

/*
 * `Shared.undo(token)` (ADR-0023): the token spent, its held-back effects cancelled, and its compensation run on the
 * same transaction as a command of its own, with that command's policy and audit. Each reversible command's slice
 * owns its compensation, under the name it issues the token with (`UndoCompensations`).
 */

export const undo = Effect.fn("Shared.undo")(function*(token: string) {
  yield* spend(Undo.hashOf(token))
})

/**
 * The same, by the token's hash (`Undo.hashOf`), for an undo asked for by what it undoes rather than by the token a tab
 * was handed (a chat card's "Ongedaan maken", `Chats.undoAction`). The checks are `redeem`'s: the caller's own token,
 * unspent, inside its window.
 */
export const undoByHash = Effect.fn("Shared.undoByHash")(function*(hash: string) {
  yield* spend(Effect.succeed(hash))
})

const spend = Effect.fn("Shared.spend")(function*(hash: Effect.Effect<string>) {
  const db = yield* Db
  const compensations = yield* UndoCompensations
  const h = yield* hash
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const { command, compensation } = yield* Undo.redeemByHash(sql, h)
      const run = compensations[command]
      if (run === undefined) return yield* Effect.die(new Error(`no compensation for ${command}`))
      yield* run(sql, compensation)
    })
  )
})
