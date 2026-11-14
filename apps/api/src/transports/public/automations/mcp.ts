import { AutomationsTools } from "@insyte/api/mcp/tools/AutomationsTools"
import { Effect, Layer } from "effect"
import { notForAgents } from "../mcp/Governance.ts"
import { AutomationsV1 } from "./AutomationsV1.ts"

export const AutomationsMcp = AutomationsTools.toLayer(Effect.gen(function*() {
  const read = yield* AutomationsV1
  return {
    list_automations: ({ status }) => read.automations(status),
    get_automation: ({ automation_id }) => read.automation(automation_id),
    list_automation_runs: ({ automation_id, status, cursor }) => read.runs(automation_id, { status, cursor }),
    // A run acts as the flow's own account, which may refund or message a supplier: no agent action names starting
    // one, so an agent's key is refused, as it is over `/v1` (`Runs.start`); any other key runs it as before.
    trigger_automation: ({ automation_id, order_id, idempotency_key }) =>
      notForAgents("trigger_automation", read.startRun(automation_id, { order_id }, idempotency_key))
  }
})).pipe(Layer.provide(AutomationsV1.layer))
