import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AgentActionFixed,
  AgentLogChange,
  AgentLogCounts,
  AgentLogEntry,
  AgentLogPage,
  IdInput,
  ListInput
} from "@insyte/modules/agent/domain/AgentLog"
import {
  AiBudgets,
  AutonomyLocked,
  AutonomyPolicy,
  AutonomySaved,
  AutonomyStale,
  BudgetInvalid,
  BudgetsSaved,
  HistoryInput,
  ResetAutonomyInput,
  SetAutonomyInput,
  SetBudgetsInput
} from "@insyte/modules/agent/domain/Autonomy"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Insyte AI's rules and log (M15 step 6; ADR-0027): Zelfstandigheid (the level per catalogue action, its versions),
 * Limieten (the month's AI budgets) and Wat Insyte deed (what agents ran, with "Ongedaan maken" inside the window and
 * the compensation after it). Read by the whole team; the rules change with `ai.autonomy`, an action is taken back
 * with its area's Bewerken.
 */
export class AgentRpcs extends RpcGroup.make(
  Rpc.make("Autonomy.get", { payload: HistoryInput, success: AutonomyPolicy, error: Forbidden }),
  Rpc.make("Autonomy.set", {
    payload: SetAutonomyInput,
    success: AutonomySaved,
    error: Schema.Union([Forbidden, Invalid, AutonomyLocked, AutonomyStale])
  }),
  Rpc.make("Autonomy.resetDefaults", {
    payload: ResetAutonomyInput,
    success: AutonomySaved,
    error: Schema.Union([Forbidden, AutonomyStale])
  }),
  Rpc.make("AiBudget.get", { success: AiBudgets, error: Forbidden }),
  Rpc.make("AiBudget.setMany", {
    payload: SetBudgetsInput,
    success: BudgetsSaved,
    error: Schema.Union([Forbidden, BudgetInvalid])
  }),
  Rpc.make("AgentLog.list", { payload: ListInput, success: AgentLogPage }),
  Rpc.make("AgentLog.counts", { success: AgentLogCounts }),
  Rpc.make("AgentLog.get", { payload: IdInput, success: AgentLogEntry, error: NotFound }),
  Rpc.make("AgentLog.undo", {
    payload: IdInput,
    success: AgentLogChange,
    error: Schema.Union([Forbidden, NotFound, Conflict, AgentActionFixed])
  }),
  Rpc.make("AgentLog.redo", {
    payload: IdInput,
    success: AgentLogChange,
    error: Schema.Union([Forbidden, NotFound, Conflict, AgentActionFixed])
  }),
  Rpc.make("AgentLog.compensate", {
    payload: IdInput,
    success: AgentLogChange,
    error: Schema.Union([Forbidden, NotFound, Conflict, AgentActionFixed])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
