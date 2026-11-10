import type { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/** One reversible command's compensation, run on the undo's transaction with the snapshot its token holds. */
export type Compensation = (
  sql: SqlClient.SqlClient,
  compensation: unknown
) => Effect.Effect<void, Forbidden | NotFound | Conflict | SqlError.SqlError, CurrentPrincipal>

/**
 * Every reversible command's compensation, by the name it issues its token under (`orders.restore`, `returns.restore`,
 * ADR-0023). Each slice owns its own; they are put together where the app is composed, so undo names no slice.
 */
export class UndoCompensations extends Context.Service<UndoCompensations, Readonly<Record<string, Compensation>>>()(
  "undo/UndoCompensations"
) {}
