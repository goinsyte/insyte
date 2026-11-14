import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { AgentLogEntry, AgentLogPage } from "@insyte/modules/agent/domain/AgentLog"
import { AiBudgets, AutonomyPolicy } from "@insyte/modules/agent/domain/Autonomy"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Insyte AI (M15 step 6): Zelfstandigheid with its history, the month's AI budgets, and Wat Insyte deed, primed by
 * their routes' loaders and carried in the document. A save of the rules names `AUTONOMY`, of the limits `AI_BUDGETS`;
 * an agent's action, and a person taking one back, name `AGENT_LOG`, which the log's page reads again by.
 */

export const AUTONOMY = ["autonomy"] as const
export const AI_BUDGETS = ["ai-budgets"] as const
export const AGENT_LOG = ["agent-log"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
/** The log is read by the whole team: no read of it is refused for a role. */
const logErrors = Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const autonomyAtom = Atom.serializable(
  ConsoleClient.query("Autonomy.get", {}, { reactivityKeys: [...AUTONOMY, ...AI_BUDGETS] }),
  { key: "autonomy", schema: AsyncResult.Schema({ success: AutonomyPolicy, error: errors }), skipInitialRun: true }
)

export const budgetsAtom = Atom.serializable(
  ConsoleClient.query("AiBudget.get", undefined, { reactivityKeys: AI_BUDGETS }),
  { key: "ai-budgets", schema: AsyncResult.Schema({ success: AiBudgets, error: errors }), skipInitialRun: true }
)

/** Wat Insyte deed: the newest rows the viewer may see, with the counts over all of them. */
export const agentLogAtom = Atom.serializable(
  ConsoleClient.query("AgentLog.list", { limit: 200 }, { reactivityKeys: AGENT_LOG }),
  { key: "agent-log", schema: AsyncResult.Schema({ success: AgentLogPage, error: logErrors }), skipInitialRun: true }
)

/** One row by its id: the address's `?row=`, where it is older than the list. */
export const agentEntryAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("AgentLog.get", { id }, { reactivityKeys: AGENT_LOG }),
    {
      key: `agent-log:${id}`,
      schema: AsyncResult.Schema({ success: AgentLogEntry, error: Schema.Union([NotFound, logErrors]) }),
      skipInitialRun: true
    }
  )
)

export const agentWrites = {
  setAutonomy: ConsoleClient.mutation("Autonomy.set"),
  resetAutonomy: ConsoleClient.mutation("Autonomy.resetDefaults"),
  setBudgets: ConsoleClient.mutation("AiBudget.setMany"),
  undoAction: ConsoleClient.mutation("AgentLog.undo"),
  redoAction: ConsoleClient.mutation("AgentLog.redo"),
  compensateAction: ConsoleClient.mutation("AgentLog.compensate"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
