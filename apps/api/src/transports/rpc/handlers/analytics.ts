import { AnalyticsRpcs } from "@insyte/api/rpc/AnalyticsRpcs"
import { AnalyticsService } from "@insyte/modules/analytics/Analytics"
import { Effect } from "effect"

export const AnalyticsHandlers = AnalyticsRpcs.toLayer(Effect.gen(function*() {
  const analytics = yield* AnalyticsService
  return AnalyticsRpcs.of({
    "Analytics.periods": () => analytics.periods,
    "Analytics.overview": (input) => analytics.overview(input),
    "Analytics.charts": (input) => analytics.charts(input),
    "Analytics.findings": (input) => analytics.findings(input),
    "Analytics.explain": (ref) => analytics.explain(ref),
    "Analytics.records": (input) => analytics.records(input)
  })
}))
