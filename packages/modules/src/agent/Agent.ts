import { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { SqlClient } from "effect/sql"
import type { Relay } from "../shared/domain/Outbox.ts"
import type {
  AgentActionFixed,
  AgentLogChange,
  AgentLogCounts,
  AgentLogEntry,
  AgentLogPage,
  ListInput
} from "./domain/AgentLog.ts"
import type {
  AiBudgets,
  AutonomyLocked,
  AutonomyPolicy,
  AutonomySaved,
  AutonomyStale,
  BudgetInvalid,
  BudgetsSaved,
  SetAutonomyInput,
  SetBudgetsInput
} from "./domain/Autonomy.ts"
import { AgentLinks } from "./Links.ts"
import * as Autonomy from "./use-cases/autonomy.ts"
import * as Budgets from "./use-cases/budgets.ts"
import * as Govern from "./use-cases/govern.ts"
import * as Log from "./use-cases/log.ts"

/*
 * The agent's rules and its log (M15 step 6; ADR-0027): Zelfstandigheid and Limieten as the team sets them, the
 * governed wrapper every agent action goes through, and Wat Insyte deed with its way back. A database that does not
 * answer is a defect, as everywhere.
 */

type R = Db | CurrentPrincipal

/** @effect-expect-leaking Db CurrentPrincipal */
export class AutonomyService extends Context.Service<AutonomyService, {
  readonly get: (input: { readonly limit?: number | undefined }) => Effect.Effect<AutonomyPolicy, Forbidden, R>
  readonly set: (
    input: SetAutonomyInput
  ) => Effect.Effect<AutonomySaved, Forbidden | Invalid | AutonomyLocked | AutonomyStale, R>
  readonly resetDefaults: (baseVersion: number) => Effect.Effect<AutonomySaved, Forbidden | AutonomyStale, R>
}>()("modules/AutonomyService") {
  static readonly layer = Layer.succeed(AutonomyService, {
    get: (input) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Autonomy.get(sql, input.limit))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    set: (input) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Autonomy.set(sql, input))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      ),
    resetDefaults: (v) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Autonomy.resetDefaults(sql, v))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      )
  })
}

/** @effect-expect-leaking Db CurrentPrincipal */
export class AiBudgetService extends Context.Service<AiBudgetService, {
  readonly get: Effect.Effect<AiBudgets, Forbidden, R>
  readonly setMany: (input: SetBudgetsInput) => Effect.Effect<BudgetsSaved, Forbidden | BudgetInvalid, R>
}>()("modules/AiBudgetService") {
  static readonly layer = Layer.succeed(AiBudgetService, {
    get: Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Budgets.get(sql))).pipe(
      Effect.catchIf(SqlError.isSqlError, Effect.die)
    ),
    setMany: (input) =>
      Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Budgets.setMany(sql, input))).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      )
  })
}

type Fixed = Forbidden | NotFound | Conflict | AgentActionFixed

/** @effect-expect-leaking Db CurrentPrincipal Relay */
export class AgentLogService extends Context.Service<AgentLogService, {
  readonly list: (input: ListInput) => Effect.Effect<AgentLogPage, never, R>
  readonly counts: Effect.Effect<AgentLogCounts, never, R>
  readonly get: (id: string) => Effect.Effect<AgentLogEntry, NotFound, R>
  readonly undo: (id: string) => Effect.Effect<AgentLogChange, Fixed, R>
  readonly redo: (id: string) => Effect.Effect<AgentLogChange, Fixed, R | Relay>
  readonly compensate: (id: string) => Effect.Effect<AgentLogChange, Fixed, R | Relay>
}>()("modules/AgentLogService") {
  static readonly layer = Layer.effect(
    AgentLogService,
    Effect.map(Effect.service(AgentLinks), (links) => {
      return {
        list: (input) =>
          Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Log.list(sql, input))).pipe(
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          ),
        counts: Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Log.countsOf(sql))).pipe(
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        ),
        get: (id) =>
          Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Log.get(sql, id))).pipe(
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          ),
        undo: (id) =>
          Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => Log.undo(sql, id))).pipe(
            Effect.provideService(AgentLinks, links),
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          ),
        redo: (id) =>
          Effect.flatMap(Effect.service(Db), (db) => Log.redo(db.scoped, id)).pipe(
            Effect.provideService(AgentLinks, links),
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          ),
        compensate: (id) =>
          Effect.flatMap(Effect.service(Db), (db) => Log.compensate(db.scoped, id)).pipe(
            Effect.provideService(AgentLinks, links),
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          )
      }
    })
  )
}

/** An agent's action under the workspace's autonomy rules: run, a proposal, or refused (`ActionNotAllowed`). */
export const govern = Govern.govern
export type { Governed, Outcome as GovernedOutcome } from "./use-cases/govern.ts"

/** `Shared.undo` for `autonomy.restore`. */
export const restoreAutonomy: (
  sql: SqlClient.SqlClient,
  compensation: unknown
) => Effect.Effect<void, Forbidden | NotFound | SqlError.SqlError, CurrentPrincipal> = Autonomy.restore

/** `Shared.undo` for `ai_budgets.restore`. */
export const restoreBudgets: (
  sql: SqlClient.SqlClient,
  compensation: unknown
) => Effect.Effect<void, Forbidden | SqlError.SqlError, CurrentPrincipal> = Budgets.restore

export const AUTONOMY_RESTORE = Autonomy.RESTORE
export const BUDGETS_RESTORE = Budgets.RESTORE
