import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { type CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import type { FactsRange, RangeInput } from "./domain/Facts.ts"
import * as Facts from "./use-cases/facts.ts"

/*
 * The daily facts (M10.4): `fact_orders_day`, `fact_refunds_day` and `fact_deliveries_day`, kept from the rows, and
 * `fact_disputes_day` (M14.1), which the chargebacks' own trigger keeps and every drain of a store-day rebuilds too. The
 * relay's `facts` sink drains one batch of marked days on its transaction (`drainIn`); the 15-minute sweep drains the
 * rest per workspace (`drainWorkspace`), and once a night marks the last three days of every store first
 * (`markRecentWorkspace`). `range` is the read Start's figures switch to.
 */

/** One batch of marked days recomputed, inside a transaction already scoped to its workspace (the relay's). */
export const drainIn = (sql: SqlClient.SqlClient): Effect.Effect<number, SqlError.SqlError> => Facts.drain(sql)

/**
 * One workspace's marked days recomputed, a batch per transaction, as `system`, up to `batches` of them (the sweep
 * leaves a long first import's remainder to its next turn); how many days.
 */
export const drainWorkspace = (
  workspaceId: WorkspaceId,
  batches = Number.POSITIVE_INFINITY
): Effect.Effect<number, SqlError.SqlError, Db> =>
  Effect.gen(function*() {
    const db = yield* Db
    let total = 0
    for (let turn = 0; turn < batches; turn++) {
      const done = yield* db.scopedFor((sql) => Facts.drain(sql))
      total += done
      if (done < Facts.BATCH_DAYS) break
    }
    return total
  }).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId }))

/** The nightly pass for one workspace: its stores' last three days marked; how many marks were new. */
export const markRecentWorkspace = (workspaceId: WorkspaceId): Effect.Effect<number, SqlError.SqlError, Db> =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor((sql) => Facts.markRecent(sql))).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId })
  )

/** One workspace's facts rebuilt whole from its rows (a repair, and the tests' oracle); how many days. */
export const rebuildWorkspace = (workspaceId: WorkspaceId): Effect.Effect<number, SqlError.SqlError, Db> =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor((sql) => Facts.markAll(sql))).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId }),
    Effect.andThen(drainWorkspace(workspaceId))
  )

/** The workspaces the sweep visits: those with marked days, or (`withStores`, the nightly pass) every one with a store. */
export const sweepWorkspaces = (
  withStores: boolean
): Effect.Effect<ReadonlyArray<WorkspaceId>, SqlError.SqlError, Db> =>
  Effect.flatMap(
    Effect.service(Db),
    (db) =>
      db.routing((sql) =>
        Effect.map(
          sql<{ workspaceId: WorkspaceId }>`select workspace_id from facts_workspaces(${withStores})`,
          (rows) => rows.map((r) => r.workspaceId)
        )
      )
  )

/** A window's facts per day and store, inside the principal's stores. */
export const range: (
  input: typeof RangeInput.Type
) => Effect.Effect<FactsRange, SqlError.SqlError, Db | CurrentPrincipal> = Facts.range
