import { AnalyticsTools } from "@insyte/api/mcp/tools/AnalyticsTools"
import { Effect, Layer } from "effect"
import { AnalyticsV1 } from "./AnalyticsV1.ts"

export const AnalyticsMcp = AnalyticsTools.toLayer(Effect.gen(function*() {
  const read = yield* AnalyticsV1
  return {
    get_analytics_overview: ({ a, b }) => read.analyticsOverview(a, b)
  }
})).pipe(Layer.provide(AnalyticsV1.layer))
