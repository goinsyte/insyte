import { AffiliatesTools } from "@insyte/api/mcp/tools/AffiliatesTools"
import { Effect, Layer } from "effect"
import { AffiliatesV1 } from "./AffiliatesV1.ts"

export const AffiliatesMcp = AffiliatesTools.toLayer(Effect.gen(function*() {
  const read = yield* AffiliatesV1
  return {
    list_affiliates: (query) => read.affiliates(query),
    list_affiliate_payouts: (query) => read.payouts(query)
  }
})).pipe(Layer.provide(AffiliatesV1.layer))
