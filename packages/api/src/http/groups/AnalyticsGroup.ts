import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestV1, ScopeMissingV1 } from "../Errors.ts"

/* Analyse: one month against another, in six figures; and the figures a sheet reads, per calendar month. */

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
    available: Schema.Boolean.annotate({ description: "False where the rows are not kept yet." }),
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

export const AnalyticsFiguresV1 = Schema.Struct({
  currency: Schema.String.annotate({ description: "The workspace's currency, every amount's (major units)." }),
  current_month: Schema.String.annotate({ description: "The month under way, YYYY-MM." }),
  months: Schema.Array(Schema.String).annotate({
    description: "The months there are figures for, from the first order's to the current one, oldest first."
  }),
  figures: Schema.Array(Schema.Struct({
    metric: Schema.String,
    month: Schema.NullOr(Schema.String).annotate({ description: "The calendar month read, YYYY-MM." }),
    value: Schema.NullOr(Schema.Finite).annotate({
      description: "Money in major units, `marge` as a fraction, a count or `roas` as itself; null with an error."
    }),
    error: Schema.NullOr(Schema.Literals(["unknown_metric", "no_month", "forbidden", "unavailable", "no_ads"]))
      .annotate({
        description:
          "Why there is no number: an unknown metric, a month without figures, a figure the key may not read, one Insyte does not keep yet (revenue per marketing channel), or ROAS in a month without ad spend."
      }),
    rows: Schema.Int.annotate({
      description: "How many rows stand behind it: counted orders, or for chargebacks the cases."
    })
  }))
}).annotate({ identifier: "AnalyticsFigures" })

export class AnalyticsGroup extends HttpApiGroup.make("analytics")
  .add(
    HttpApiEndpoint.get("overview", "/analytics/overview", {
      query: Schema.Struct({ a: AnalyticsMonthV1, b: AnalyticsMonthV1 }),
      success: AnalyticsOverviewV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "Analyse: month `a` against month `b`, both cut to the shorter one's days (a month under way runs to today), in six figures: counted revenue (minor units, each day at its exchange rate), paid orders, on time (% of orders delivered, by the day delivered), refunded (% of orders placed with a refund since), disputes (cases opened, by the day opened) and hours to done (tickets by the day they came in). Inside the key's stores. Needs `analytics.read`."
    )
  )
  .add(
    HttpApiEndpoint.get("figures", "/analytics/figures", {
      query: Schema.Struct({
        metrics: Schema.String.annotate({
          description:
            "Comma-separated figures, as INSYTE() names them: omzet, bestellingen, gemiddelde_bestelling, terugbetaald, chargebacks, advertentiekosten, overige_kosten, kosten, nettowinst, marge, roas, advertenties_meta, advertenties_google (omzet_meta, omzet_google, omzet_klaviyo and omzet_organisch are not kept yet)."
        }),
        months: Schema.optional(Schema.String).annotate({
          description: "Comma-separated months, YYYY-MM, up to 24; the month under way when left out."
        })
      }),
      success: AnalyticsFiguresV1,
      error: [ScopeMissingV1, InvalidRequestV1]
    }).annotate(
      OpenApi.Description,
      "The figures a sheet's INSYTE() reads, each over a whole calendar month (the month under way to today), inside the key's stores and in the workspace's currency: sales from the counted orders, what was put under dispute that month, and Kosten's costs, net profit, margin, ROAS and ad spend per platform. One answer per metric and month, metrics first. Needs `analytics.read`."
    )
  )
  .annotate(OpenApi.Title, "Analytics")
{}
