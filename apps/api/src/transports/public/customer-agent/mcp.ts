import { CustomerAgentTools } from "@insyte/api/mcp/tools/CustomerAgentTools"
import { Effect, Layer } from "effect"
import { CustomerAgentV1 } from "./CustomerAgentV1.ts"

export const CustomerAgentMcp = CustomerAgentTools.toLayer(Effect.gen(function*() {
  const read = yield* CustomerAgentV1
  return {
    get_customer_agent: () => read.settings,
    customer_agent_today: () => read.today
  }
})).pipe(Layer.provide(CustomerAgentV1.layer))
