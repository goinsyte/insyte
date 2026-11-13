import { ShopifyWrites } from "@insyte/modules/shared/domain/ShopifyWrites"
import { Effect } from "effect"
import { onEach, subscriber } from "../Subscriber.ts"

export const Shopify = subscriber("shopify", {
  // An order, a product or a customer changed in Insyte (M7): to Shopify, one Workflow per event, named by it.
  ...onEach(
    [
      "order.updated",
      "order.cancelled",
      "refund.requested",
      "product.updated",
      "customer.updated",
      "customer.created",
      "return.resolution_requested"
    ],
    (id, event) =>
      Effect.flatMap(
        Effect.service(ShopifyWrites),
        (writes) => writes.start({ key: `sw-${id}`, workspaceId: event.workspaceId, write: event })
      )
  ),
  // A return approved or rejected in Insyte goes to Shopify only where it came from there (M9.3).
  ...onEach(["return.approved", "return.rejected"], (id, event) =>
    event.toShopify.length > 0
      ? Effect.flatMap(
        Effect.service(ShopifyWrites),
        (writes) => writes.start({ key: `sw-${id}`, workspaceId: event.workspaceId, write: event })
      )
      : undefined)
})
