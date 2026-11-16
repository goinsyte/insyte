import { Tool, Toolkit } from "effect/ai"
import { ScopeMissingV1 } from "../../http/Errors.ts"
import { CustomerAgentDayV1, CustomerAgentV1 } from "../../http/groups/CustomerAgentGroup.ts"
import { asKey, Needs, read } from "../Shared.ts"

/* Klantagent (M15 step 8): how the customer agent answers shoppers, and its day. Read only. */

export const GetCustomerAgent = Tool.make("get_customer_agent", {
  description:
    "Klantagent: whether the customer agent is on, each channel's mode as set and as it works now (never more than the autonomy rule for answering customers allows), its opening hours, when it hands a chat to the team and its tone. Changed in the console only. Needs support.read.",
  success: CustomerAgentV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true).annotate(Needs, [read("support")])

export const CustomerAgentToday = Tool.make("customer_agent_today", {
  description:
    "The customer agent's day so far: website chats heard, answered by itself, handed over, still waiting for a person, and its first reply's average delay. Within the key's stores. Needs support.read.",
  success: CustomerAgentDayV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true).annotate(Needs, [read("support")])

export const CustomerAgentTools = Toolkit.make(GetCustomerAgent, CustomerAgentToday)
