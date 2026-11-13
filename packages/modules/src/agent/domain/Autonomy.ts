import { AGENT_ACTION_IDS, AUTONOMY_LEVELS } from "@insyte/domain/AgentActions"
import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Zelfstandigheid (M15 step 6; ADR-0027, domain.md §9.6): per catalogue action the level the workspace set, the limits
 * Zelf doen keeps to, the version in force, and its history. A save names the version it was made on, so two people
 * saving at once do not overwrite each other silently (`AutonomyStale`); a locked action never becomes Zelf doen
 * (`AutonomyLocked`). Errors carry tags and fields; the console says them in Dutch.
 */

export const ActionId = Schema.Literals(AGENT_ACTION_IDS)
export const Level = Schema.Literals(AUTONOMY_LEVELS)

export const Limit = Schema.Struct({
  perDay: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  maxAmountMinor: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)))
})

export const Levels = Schema.Record(ActionId, Level)

export const PolicyChange = Schema.Struct({ id: ActionId, from: Level, to: Level })

/** One version of the policy, newest first in `history`. `by` is a name; `null` is the default the workspace began with. */
export const PolicyVersion = Schema.Struct({
  version: Schema.Int,
  at: Schema.Finite,
  by: Schema.NullOr(Schema.String),
  changes: Schema.Array(PolicyChange)
})
export type PolicyVersion = typeof PolicyVersion.Type

export class AutonomyPolicy extends Schema.Class<AutonomyPolicy>("agent/AutonomyPolicy")({
  version: Schema.Int,
  /** Every catalogue action, the default where none was set. */
  levels: Levels,
  limits: Schema.Record(Schema.String, Limit),
  history: Schema.Array(PolicyVersion)
}) {}

export const SetAutonomyInput = Schema.Struct({
  /** The levels to keep, by catalogue id; one left out keeps its level, an id outside the catalogue is refused. */
  levels: Schema.Record(Schema.String, Level),
  /** The limits to keep, whole; left out, they stay as they are. */
  limits: Schema.optional(Schema.Record(Schema.String, Limit)),
  baseVersion: Schema.Int
})
export type SetAutonomyInput = typeof SetAutonomyInput.Type

export const ResetAutonomyInput = Schema.Struct({ baseVersion: Schema.Int })

export const HistoryInput = Schema.Struct({ limit: Schema.optional(Schema.Int) })

export class AutonomySaved extends Schema.Class<AutonomySaved>("agent/AutonomySaved")({
  policy: AutonomyPolicy,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** A locked action set to Zelf doen: it can only ask or never happen. */
export class AutonomyLocked extends Schema.TaggedError<AutonomyLocked>()("AutonomyLocked", { id: Schema.String }) {}

/** Someone saved since this draft was opened: `version` is the one in force now. */
export class AutonomyStale extends Schema.TaggedError<AutonomyStale>()("AutonomyStale", { version: Schema.Int }) {}

/** What `Autonomy.decide` answers, with the reason where it does not simply run. */
export const Decision = Schema.Struct({
  decision: Schema.Literals(["run", "propose", "refuse"]),
  level: Level,
  policyVersion: Schema.Int,
  reason: Schema.NullOr(Schema.String)
})
export type Decision = typeof Decision.Type

/** The compensation of an autonomy save (`autonomy.restore`): the version to write again, as a new one. */
export const AutonomyRestore = Schema.Struct({ toVersion: Schema.Int })

/* ── AI budgets (Limieten) ─────────────────────────────────────────────────────────────────────────────────────── */

export const PersonBudget = Schema.Struct({
  memberId: Schema.String,
  /** Whole euros; `null` is no limit. */
  limit: Schema.NullOr(Schema.Int),
  /** Euros this month. */
  used: Schema.Finite
})

export class AiBudgets extends Schema.Class<AiBudgets>("agent/AiBudgets")({
  /** The calendar month, `YYYY-MM`. */
  month: Schema.String,
  workspace: Schema.Struct({ limit: Schema.NullOr(Schema.Int), used: Schema.Finite }),
  /** Spent by the background agent and the customer agent (calls without a person). */
  background: Schema.Finite,
  people: Schema.Array(PersonBudget),
  /** Whether model calls are recorded (M15 step 1 on): the uses are the month's calls, not zeros. */
  metered: Schema.Boolean
}) {}

export const SetBudgetsInput = Schema.Struct({
  entries: Schema.Array(Schema.Struct({
    /** `workspace`, or a member's id. */
    scope: Schema.String,
    limit: Schema.NullOr(Schema.Int)
  }))
})
export type SetBudgetsInput = typeof SetBudgetsInput.Type

export class BudgetsSaved extends Schema.Class<BudgetsSaved>("agent/BudgetsSaved")({
  budgets: AiBudgets,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** A limit below zero, or a person who is not (or no longer) in the team. */
export class BudgetInvalid extends Schema.TaggedError<BudgetInvalid>()("BudgetInvalid", {
  scope: Schema.String,
  reason: Schema.Literals(["negative", "member_not_found"])
}) {}

export const BudgetRestore = Schema.Struct({
  entries: Schema.Array(Schema.Struct({ scope: Schema.String, limit: Schema.NullOr(Schema.Int) }))
})
