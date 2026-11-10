import { Context, type Effect } from "effect"
import type { OutboxEvent } from "./Outbox.ts"

/**
 * A change made in Insyte on its way to Shopify (M7): the outbox event as the relay delivered it. A return's (M9.3): a
 * Shopify return approved or declined, a resolution made as a gift card, a discount code or a new order.
 */
export type ShopifyWrite = Extract<
  OutboxEvent,
  {
    type:
      | "order.updated"
      | "order.cancelled"
      | "refund.requested"
      | "product.updated"
      | "customer.updated"
      | "customer.created"
      | "return.approved"
      | "return.rejected"
      | "return.resolution_requested"
  }
>

/** The records a change names, whatever their kind. */
export const idsOf = (write: ShopifyWrite): ReadonlyArray<string> =>
  write.type === "product.updated"
    ? write.productIds
    : write.type === "customer.updated" || write.type === "customer.created"
    ? write.customerIds
    : write.type === "return.approved" || write.type === "return.rejected"
    ? write.toShopify
    : write.type === "return.resolution_requested"
    ? write.returnIds
    : write.orderIds

/** What became of one record's change: sent, refused by Shopify (the reason is Shopify's), or not sent at all. */
export interface WriteOutcome {
  readonly id: string
  readonly outcome: "sent" | "refused" | "skipped"
  readonly reason: string | null
}

/**
 * Sends a change to Shopify (M7.1): one `ShopifyWriteWorkflow` instance per outbox event, named by it, so a relay that
 * delivers the event twice sends it once.
 */
export class ShopifyWrites extends Context.Service<ShopifyWrites, {
  readonly start: (
    input: { readonly key: string; readonly workspaceId: string; readonly write: ShopifyWrite }
  ) => Effect.Effect<void>
}>()("shared/ShopifyWrites") {}
