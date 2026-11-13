import { AgentRpcs } from "@insyte/api/rpc/AgentRpcs"
import { AgentLogService, AiBudgetService, AutonomyService } from "@insyte/modules/agent/Agent"
import { Effect } from "effect"

export const AgentHandlers = AgentRpcs.toLayer(Effect.gen(function*() {
  const autonomy = yield* AutonomyService
  const budgets = yield* AiBudgetService
  const log = yield* AgentLogService
  return AgentRpcs.of({
    "Autonomy.get": (input) => autonomy.get(input),
    "Autonomy.set": (input) => autonomy.set(input),
    "Autonomy.resetDefaults": ({ baseVersion }) => autonomy.resetDefaults(baseVersion),
    "AiBudget.get": () => budgets.get,
    "AiBudget.setMany": (input) => budgets.setMany(input),
    "AgentLog.list": (input) => log.list(input),
    "AgentLog.counts": () => log.counts,
    "AgentLog.get": ({ id }) => log.get(id),
    "AgentLog.undo": ({ id }) => log.undo(id),
    "AgentLog.redo": ({ id }) => log.redo(id),
    "AgentLog.compensate": ({ id }) => log.compensate(id)
  })
}))
