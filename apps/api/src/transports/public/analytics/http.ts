import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AnalyticsV1 } from "./AnalyticsV1.ts"

export const AnalyticsHttp = HttpApiBuilder.group(
  PublicApi,
  "analytics",
  (handlers) =>
    Effect.map(
      Effect.service(AnalyticsV1),
      (act) =>
        handlers
          .handle("overview", ({ query }) => act.analyticsOverview(query.a, query.b))
          .handle("figures", ({ query }) => act.figures(query.metrics, query.months))
    )
).pipe(Layer.provide(AnalyticsV1.layer))
