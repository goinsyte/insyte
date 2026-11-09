import { Context, type Effect } from "effect"
import type { OrderWrite } from "./WriteBack.ts"

/**
 * Sends an order change to Shopify (M7.1): one `ShopifyWriteWorkflow` instance per outbox event, named by it, so a
 * relay that delivers the event twice sends it once.
 */
export class ShopifyWrites extends Context.Service<ShopifyWrites, {
  readonly start: (
    input: { readonly key: string; readonly workspaceId: string; readonly write: OrderWrite }
  ) => Effect.Effect<void>
}>()("orders/ShopifyWrites") {}
