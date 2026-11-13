import { AutomationsTools } from "@insyte/api/mcp/tools/AutomationsTools"
import { Effect, Layer } from "effect"
import { AutomationsV1 } from "./AutomationsV1.ts"

export const AutomationsMcp = AutomationsTools.toLayer(Effect.gen(function*() {
  const read = yield* AutomationsV1
  return {
    list_automations: ({ status }) => read.automations(status),
    get_automation: ({ automation_id }) => read.automation(automation_id),
    list_automation_runs: ({ automation_id, status, cursor }) => read.runs(automation_id, { status, cursor }),
    trigger_automation: ({ automation_id, order_id, idempotency_key }) =>
      read.startRun(automation_id, { order_id }, idempotency_key)
  }
})).pipe(Layer.provide(AutomationsV1.layer))
