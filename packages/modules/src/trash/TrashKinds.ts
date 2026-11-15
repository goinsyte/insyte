import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import type { UndoTicket } from "../shared/domain/Undo.ts"
import type { Actor } from "../shared/use-cases/Audit.ts"
import type { TrashKind } from "./domain/Trash.ts"

/*
 * What the Prullenbak asks of each slice whose rows it holds (M17 step 20.1a): its own put-back and its purge. A port
 * at the slice's root, not in `domain/`, since a put-back runs on the database. A new kind's checklist is on
 * `TrashKind` (`domain/Trash.ts`).
 */

/** One kind's own commands, as its slice has them. */
export interface TrashKindLinks {
  /**
   * Its slice's put-back, with that slice's policy, audit and outbox; answers the undo it issued. A `Conflict` where the
   * item cannot go back as it was (a store it served is gone).
   */
  readonly restore: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<
    ReadonlyArray<UndoTicket>,
    Conflict | Forbidden | NotFound | SqlError.SqlError,
    Db | CurrentPrincipal
  >
  /** Gone for good, on the caller's transaction: the rows, what hangs off them, an audit line each, as `actor`. */
  readonly purge: (
    sql: SqlClient.SqlClient,
    workspaceId: string,
    ids: ReadonlyArray<string>,
    actor: Actor
  ) => Effect.Effect<void, SqlError.SqlError>
}

/**
 * Every kind's commands, by kind. Each slice owns its own; they are put together where the app is composed
 * (`SliceLinks`), so the Prullenbak names no slice.
 */
export class TrashKinds extends Context.Service<TrashKinds, Readonly<Record<TrashKind, TrashKindLinks>>>()(
  "trash/TrashKinds"
) {}
