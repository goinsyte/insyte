import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { ChargebacksV1 } from "./ChargebacksV1.ts"

export const ChargebacksHttp = HttpApiBuilder.group(
  PublicApi,
  "chargebacks",
  (handlers) =>
    Effect.map(
      Effect.service(ChargebacksV1),
      (act) =>
        handlers
          .handle("chargebacks", ({ query }) => act.chargebacks(query))
          .handle("chargeback", ({ params }) => act.chargeback(params.id))
    )
).pipe(Layer.provide(ChargebacksV1.layer))
