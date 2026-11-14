import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { InvalidRequestV1, ScopeMissingV1 } from "../../http/Errors.ts"
import { AnalyticsFiguresV1, AnalyticsOverviewV1 } from "../../http/groups/AnalyticsGroup.ts"
import { asKey } from "../Shared.ts"

/* Analyse (M19.3): one month against another; and INSYTE()'s figures (M14 step 4). */

export const GetAnalyticsOverview = Tool.make("get_analytics_overview", {
  description:
    "Analyse: month a against month b (YYYY-MM), both cut to the shorter one's days (a month under way runs to today), in six figures: counted revenue (minor units in the workspace's currency, each day at its exchange rate), paid orders, on time (% of orders delivered), refunded (% of orders placed with a refund since), disputes (cases opened) and hours to done for tickets. Each figure says which rows it sums and how many. Needs analytics.read.",
  parameters: Schema.Struct({
    a: Schema.String.annotate({ description: "The month read, YYYY-MM." }),
    b: Schema.String.annotate({ description: "The month it is compared with, YYYY-MM." })
  }),
  success: AnalyticsOverviewV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const GetFigures = Tool.make("get_figures", {
  description:
    "The figures a sheet's INSYTE() reads, per whole calendar month (the month under way to today), inside the key's stores, money in major units of the workspace's currency: omzet, bestellingen, gemiddelde_bestelling, terugbetaald, chargebacks (put under dispute that month), advertentiekosten, overige_kosten, kosten, nettowinst, marge (a fraction), roas, advertenties_meta, advertenties_google. Revenue per marketing channel (omzet_meta and the like) is not kept yet and answers unavailable; roas without ad spend answers no_ads. Needs analytics.read.",
  parameters: Schema.Struct({
    metrics: Schema.String.annotate({ description: "Comma-separated metrics, e.g. omzet,nettowinst,marge." }),
    months: Schema.optional(Schema.String).annotate({
      description: "Comma-separated months, YYYY-MM, up to 24; the month under way when left out."
    })
  }),
  success: AnalyticsFiguresV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const AnalyticsTools = Toolkit.make(
  GetAnalyticsOverview,
  GetFigures
)
