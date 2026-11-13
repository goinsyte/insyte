import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { NotFoundV1, ScopeMissingV1 } from "../../http/Errors.ts"
import {
  AutomationDetailV1,
  AutomationPageV1,
  AutomationRunPageV1,
  AutomationRunStatusFilter,
  AutomationRunV1,
  AutomationStatusFilter
} from "../../http/groups/AutomationsGroup.ts"
import { asKey, IdempotencyKey, OrderId, WriteFailure } from "../Shared.ts"

/* Automations (M12): the flows, one flow, its runs, and running it for an order now. */

export const ListAutomations = Tool.make("list_automations", {
  description:
    "The workspace's flows, newest first, with each status's count (draft, active, paused); by default every one. Needs automations.read.",
  parameters: Schema.Struct({ status: Schema.optional(AutomationStatusFilter) }),
  success: AutomationPageV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const GetAutomation = Tool.make("get_automation", {
  description:
    "One flow: its draft and live steps, its published versions, and what is wrong with the draft per step. Needs automations.read.",
  parameters: Schema.Struct({
    automation_id: Schema.String.annotate({ description: "The flow's id (auto_…), as list_automations gives it." })
  }),
  success: AutomationDetailV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

const AutomationId = Schema.String.annotate({ description: "The flow's id (auto_…), as list_automations gives it." })

export const ListAutomationRuns = Tool.make("list_automation_runs", {
  description:
    "One flow's runs, newest first: each with its status (running, waiting, succeeded, failed, stopped, skipped), why, the order it ran for and the version it ran on. Needs automations.read.",
  parameters: Schema.Struct({
    automation_id: AutomationId,
    status: Schema.optional(AutomationRunStatusFilter),
    cursor: Schema.optional(Schema.String)
  }),
  success: AutomationRunPageV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const TriggerAutomation = Tool.make("trigger_automation", {
  description:
    "Runs a flow's live version for one order now, as its trigger would; its steps act as the flow's own service account, so they may create tickets, label the customer or notify the team. Answers the run as it started. Needs automations.write.",
  parameters: Schema.Struct({ automation_id: AutomationId, order_id: OrderId, idempotency_key: IdempotencyKey }),
  success: AutomationRunV1,
  failure: WriteFailure,
  dependencies: asKey()
})

export const AutomationsTools = Toolkit.make(
  ListAutomations,
  GetAutomation,
  ListAutomationRuns,
  TriggerAutomation
)
