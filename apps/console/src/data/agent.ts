import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { AiBudgets, AutonomyPolicy } from "@insyte/modules/agent/domain/Autonomy"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Insyte AI (M15 step 6): Zelfstandigheid with its history, the month's AI budgets, and Wat Insyte deed, primed by
 * their routes' loaders and carried in the document. A save of the rules names `AUTONOMY`; an agent's action names
 * `AGENT_LOG` through its frame, for the log's page when it comes to the console.
 */

export const AUTONOMY = ["autonomy"] as const
export const AI_BUDGETS = ["ai-budgets"] as const
export const AGENT_LOG = ["agent-log"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const autonomyAtom = Atom.serializable(
  ConsoleClient.query("Autonomy.get", {}, { reactivityKeys: [...AUTONOMY, ...AI_BUDGETS] }),
  { key: "autonomy", schema: AsyncResult.Schema({ success: AutonomyPolicy, error: errors }), skipInitialRun: true }
)

export const budgetsAtom = Atom.serializable(
  ConsoleClient.query("AiBudget.get", undefined, { reactivityKeys: AI_BUDGETS }),
  { key: "ai-budgets", schema: AsyncResult.Schema({ success: AiBudgets, error: errors }), skipInitialRun: true }
)

export const agentWrites = {
  setAutonomy: ConsoleClient.mutation("Autonomy.set"),
  resetAutonomy: ConsoleClient.mutation("Autonomy.resetDefaults"),
  setBudgets: ConsoleClient.mutation("AiBudget.setMany"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
