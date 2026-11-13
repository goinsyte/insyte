import { ChargebacksTools } from "@insyte/api/mcp/tools/ChargebacksTools"
import { Effect, Layer } from "effect"
import { ChargebacksV1 } from "./ChargebacksV1.ts"

export const ChargebacksMcp = ChargebacksTools.toLayer(Effect.gen(function*() {
  const read = yield* ChargebacksV1
  return {
    list_chargebacks: (query) => read.chargebacks(query),
    get_chargeback: ({ chargeback_id }) => read.chargeback(chargeback_id)
  }
})).pipe(Layer.provide(ChargebacksV1.layer))
