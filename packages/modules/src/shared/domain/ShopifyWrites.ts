import { Context, type Effect } from "effect"
import type { OutboxEvent } from "./Outbox.ts"

/** A change made in Insyte on its way to Shopify (M7): the outbox event as the relay delivered it. */
export type ShopifyWrite = Extract<
  OutboxEvent,
  { type: "order.updated" | "order.cancelled" | "refund.requested" | "product.updated" }
>

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
