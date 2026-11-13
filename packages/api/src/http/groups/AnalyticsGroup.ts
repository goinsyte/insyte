import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestV1, ScopeMissingV1 } from "../Errors.ts"

/* Analyse: one month against another, in six figures. */

const AnalyticsMonthV1 = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/)).annotate({
  description: "A calendar month, YYYY-MM."
})

const AnalyticsSpanV1 = Schema.Struct({
  month: Schema.String,
  from: Schema.String.annotate({ description: "The first day read, YYYY-MM-DD." }),
  to: Schema.String.annotate({ description: "The last day read: both months are cut to the shorter one's days." }),
  days: Schema.Int,
  in_progress: Schema.Boolean
})

export const AnalyticsOverviewV1 = Schema.Struct({
  currency: Schema.String.annotate({ description: "The workspace's currency, every amount's (minor units)." }),
  a: AnalyticsSpanV1,
  b: AnalyticsSpanV1,
  figures: Schema.Array(Schema.Struct({
    id: Schema.Literals(["revenue", "paid_orders", "on_time", "refund_rate", "disputes", "resolve_hours"]),
    a: Schema.NullOr(Schema.Finite),
    b: Schema.NullOr(Schema.Finite),
    available: Schema.Boolean.annotate({ description: "False where the rows are not kept yet (disputes)." }),
    basis: Schema.Struct({
      rows: Schema.Literals(["orders", "deliveries", "tickets", "disputes"]),
      by: Schema.Literals(["placed", "delivered", "created", "opened"]),
      a_count: Schema.Int,
      b_count: Schema.Int
    }).annotate({ description: "Which rows the figure sums, by which day, and how many stand behind each month." })
  })),
  orders_total: Schema.Int,
  tickets_total: Schema.Int,
  first_order_day: Schema.NullOr(Schema.String),
  unconverted: Schema.Int.annotate({ description: "Store-days left out of the money for want of an exchange rate." })
}).annotate({ identifier: "AnalyticsOverview" })

export class AnalyticsGroup extends HttpApiGroup.make("analytics")
  .add(
    HttpApiEndpoint.get("overview", "/analytics/overview", {
      query: Schema.Struct({ a: AnalyticsMonthV1, b: AnalyticsMonthV1 }),
      success: AnalyticsOverviewV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "Analyse: month `a` against month `b`, both cut to the shorter one's days (a month under way runs to today), in six figures: counted revenue (minor units, each day at its exchange rate), paid orders, on time (% of orders delivered, by the day delivered), refunded (% of orders placed with a refund since), disputes (not kept yet) and hours to done (tickets by the day they came in). Inside the key's stores. Needs `analytics.read`."
    )
  )
  .annotate(OpenApi.Title, "Analytics")
{}
