import { ensureLegs } from "@insyte/modules/forwarding/use-cases/legs"
import { linkReplacements } from "@insyte/modules/returns/use-cases/shopify"
import { MirrorFollowers } from "@insyte/modules/stores/domain/Ports"
import { ensureDeliveries } from "@insyte/modules/tracking/use-cases/tracking"
import { Effect, Layer } from "effect"

/**
 * The stores' mirror → forwarding's legs and tracking's deliveries, on the page's transaction (M8.2, M8.4), and a
 * return's exchange or replacement order linked to it (M9.3).
 */
export const MirrorFollowersLive = Layer.succeed(MirrorFollowers, {
  ordersWritten: (sql, storeId, orderShopifyIds, live) =>
    Effect.andThen(ensureLegs(sql, storeId, orderShopifyIds, live), linkReplacements(sql, storeId, orderShopifyIds)),
  fulfilmentsWritten: ensureDeliveries
})
