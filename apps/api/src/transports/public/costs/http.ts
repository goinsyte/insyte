import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { CostsV1 } from "./CostsV1.ts"

export const CostsHttp = HttpApiBuilder.group(
  PublicApi,
  "costs",
  (handlers) =>
    Effect.map(
      Effect.service(CostsV1),
      (act) =>
        handlers
          .handle("costs", ({ query }) => act.costs(query.from, query.to))
          .handle("figures", ({ query }) => act.costFigures(query.months))
    )
).pipe(Layer.provide(CostsV1.layer))
