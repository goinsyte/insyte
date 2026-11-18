import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AffiliatesV1 } from "./AffiliatesV1.ts"

export const AffiliatesHttp = HttpApiBuilder.group(
  PublicApi,
  "affiliates",
  (handlers) =>
    Effect.map(
      Effect.service(AffiliatesV1),
      (act) =>
        handlers
          .handle("affiliates", ({ query }) => act.affiliates(query))
          .handle("affiliatePayouts", ({ query }) => act.payouts(query))
    )
).pipe(Layer.provide(AffiliatesV1.layer))
