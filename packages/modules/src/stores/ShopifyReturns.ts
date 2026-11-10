import type { Db } from "@insyte/database/Db"
import type { CurrentWorkspace } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { Relay } from "../shared/domain/Outbox.ts"

/**
 * Shopify's own returns (M9.3, `returns/request|approve|decline|close`): the stores slice receives the webhook, the
 * returns slice owns what it means for a return, in the store's workspace; composed where the app is put together.
 */
export class ShopifyReturns extends Context.Service<ShopifyReturns, {
  readonly applied: (
    storeId: string,
    topic: string,
    body: Record<string, unknown>
  ) => Effect.Effect<void, never, Db | CurrentWorkspace | Relay>
}>()("stores/ShopifyReturns") {}
