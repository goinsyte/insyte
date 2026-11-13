import { shopifyReturn } from "@insyte/modules/returns/use-cases/mirror"
import { ShopifyReturns } from "@insyte/modules/stores/ShopifyReturns"
import { Effect, Layer } from "effect"

/** The stores' webhook → a return opened, approved, declined or closed in Shopify, for the returns slice (M9.3). */
export const ShopifyReturnsLive = Layer.succeed(ShopifyReturns, {
  applied: (storeId, topic, body) => shopifyReturn(storeId, topic, body).pipe(Effect.orDie)
})
