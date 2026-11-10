import { Db } from "@insyte/database/Db"
import type { Conflict, NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { type CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { SqlClient } from "effect/sql"
import type { ListInput, QueueChange, QueueItemClosed, QueueList } from "./domain/Queue.ts"
import * as Queue from "./use-cases/queue.ts"

type R = Db | CurrentPrincipal

/**
 * The queue on Start (M10.1): the rows the person may open, ranked; seeing one, and taking that back. The rows are
 * kept by `refreshWorkspace`, which the relay runs on record changes and the 15-minute sweep runs for every workspace.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class QueueService extends Context.Service<QueueService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<QueueList, never, R>
  readonly markSeen: (id: string) => Effect.Effect<QueueChange, NotFound | QueueItemClosed, R>
  readonly reopen: (id: string) => Effect.Effect<QueueChange, NotFound | QueueItemClosed, R>
}>()("modules/QueueService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(QueueService)({
    list: (input) => Queue.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    markSeen: (id) => Queue.markSeen(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    reopen: (id) => Queue.reopen(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

/** One workspace's queue brought in line with its records, as `system`; whether anything changed. */
export const refreshWorkspace = (workspaceId: WorkspaceId): Effect.Effect<boolean, SqlError.SqlError, Db> =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor((sql) => Queue.refresh(sql))).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId })
  )

/** The queue brought in line inside a transaction already scoped to its workspace (the relay's); whether it changed. */
export const refreshIn: (sql: SqlClient.SqlClient) => Effect.Effect<boolean, SqlError.SqlError> = Queue.refresh

/** The workspaces the sweep refreshes (those with a store). */
export const sweepWorkspaces: Effect.Effect<ReadonlyArray<WorkspaceId>, SqlError.SqlError, Db> = Effect.flatMap(
  Effect.service(Db),
  (db) =>
    db.routing((sql) =>
      Effect.map(
        sql<{ workspaceId: WorkspaceId }>`select workspace_id from queue_workspaces()`,
        (rows) => rows.map((r) => r.workspaceId)
      )
    )
)

/** `Shared.undo` for `queue.restore`. */
export const restore: (
  sql: SqlClient.SqlClient,
  compensation: unknown
) => Effect.Effect<void, Conflict | SqlError.SqlError> = Queue.restore
