import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestV1, ScopeMissingV1 } from "../Errors.ts"

/* Kosten (M13 step 5): the cost lines per month, and the months' figures down to net profit. */

const MonthV1 = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/)).annotate({
  description: "A calendar month, YYYY-MM, in store time."
})

export const MonthFiguresV1 = Schema.Struct({
  month: Schema.String,
  revenue_minor: Schema.Int.annotate({ description: "Counted revenue (paid, not cancelled or refunded)." }),
  orders: Schema.Int.annotate({ description: "Counted orders." }),
  ads_minor: Schema.Int,
  other_minor: Schema.Int,
  costs_minor: Schema.Int,
  net_minor: Schema.Int,
  margin: Schema.Finite.annotate({ description: "net / revenue, 0 without revenue." }),
  roas: Schema.Finite.annotate({ description: "revenue / ad spend, 0 without ad spend." })
}).annotate({ identifier: "MonthFigures" })

export const CostLineV1 = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: Schema.Literals(["fixed", "per_order", "percent", "ads"]),
  rate: Schema.NullOr(Schema.Finite).annotate({ description: "percent: the share of revenue, 0 to 100." }),
  rate_minor: Schema.NullOr(Schema.Int).annotate({ description: "per_order: the amount per counted order." }),
  source: Schema.Literals(["manual", "meta", "google_ads"]),
  reads_from_source: Schema.Boolean.annotate({
    description: "An ad line whose account is connected: its untyped months are what the account reports."
  }),
  months: Schema.Array(Schema.Struct({
    month: Schema.String,
    amount_minor: Schema.Int,
    typed: Schema.Boolean,
    source: Schema.Literals(["typed", "account", "rule", "none"])
  }))
}).annotate({ identifier: "CostLine" })

export const CostsV1 = Schema.Struct({
  currency: Schema.String.annotate({ description: "The workspace's currency, every amount's (minor units)." }),
  months: Schema.Array(Schema.String),
  current: Schema.String.annotate({ description: "The month in progress." }),
  lines: Schema.Array(CostLineV1),
  figures: Schema.Array(MonthFiguresV1)
}).annotate({ identifier: "Costs" })

export const CostFiguresV1 = Schema.Struct({
  currency: Schema.String,
  data: Schema.Array(MonthFiguresV1)
}).annotate({ identifier: "CostFigures" })

export class CostsGroup extends HttpApiGroup.make("costs")
  .add(
    HttpApiEndpoint.get("costs", "/costs", {
      query: Schema.Struct({ from: Schema.optional(MonthV1), to: Schema.optional(MonthV1) }),
      success: CostsV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "Kosten: every cost line with what it costs in each month of the range (by default the five months up to the current one, at most 36), and each month's figures from revenue to net profit. Revenue is the counted orders' in the key's stores. Needs `analytics.read`."
    ),
    HttpApiEndpoint.get("figures", "/costs/figures", {
      query: Schema.Struct({
        months: Schema.String.annotate({ description: "Comma-separated months, YYYY-MM, up to 36." })
      }),
      success: CostFiguresV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "The month figures alone: revenue, orders, ad spend, other costs, net profit, margin and ROAS. Needs `analytics.read`."
    )
  )
  .annotate(OpenApi.Title, "Costs")
{}
