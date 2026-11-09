import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import * as Undo from "./use-cases/undo.ts"

/**
 * Undo as a server window (ADR-0023): every reversible command's "Ongedaan maken", by its token.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class UndoService extends Context.Service<UndoService, {
  readonly undo: (token: string) => Effect.Effect<void, Forbidden | NotFound | Conflict, Db | CurrentPrincipal>
}>()("modules/UndoService") {
  static readonly layer = Layer.succeed(UndoService, {
    undo: (token) => Undo.undo(token).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}
