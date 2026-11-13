import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { InvalidRequestV1, ScopeMissingV1 } from "../../http/Errors.ts"
import { CostFiguresV1, CostsV1 } from "../../http/groups/CostsGroup.ts"
import { asKey } from "../Shared.ts"

/* Kosten (M13 step 5): the cost lines per month, and the months' figures. */

const MonthParam = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/)).annotate({
  description: "A calendar month, YYYY-MM."
})

export const GetCosts = Tool.make("get_costs", {
  description:
    "Kosten: the workspace's cost lines (a share of revenue, an amount per order, a fixed amount per month, ad spend) with what each costs per month, and each month's figures: counted revenue, orders, ad spend, other costs, net profit, margin and ROAS. Amounts are minor units in the workspace's currency. Without from and to, the five months up to the current one (which is still running); at most 36 months. Needs analytics.read.",
  parameters: Schema.Struct({ from: Schema.optional(MonthParam), to: Schema.optional(MonthParam) }),
  success: CostsV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const GetCostFigures = Tool.make("get_cost_figures", {
  description:
    "Only the month figures (revenue, orders, ad spend, other costs, net profit, margin, ROAS) for the months named, comma-separated (2026-04,2026-05), up to 36. Needs analytics.read.",
  parameters: Schema.Struct({ months: Schema.String }),
  success: CostFiguresV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const CostsTools = Toolkit.make(
  GetCosts,
  GetCostFigures
)
