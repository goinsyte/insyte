import { Context } from "effect"
import { RpcMiddleware } from "effect/rpc"

/** The shopper on the returns portal (M9.3), who is no principal: only where the request came from, for its limits. */
export class ShopperRequest extends Context.Service<ShopperRequest, {
  /** The visitor's IP, as Cloudflare saw it; `null` locally, where every run shares one. */
  readonly ip: string | null
}>()("api/ShopperRequest") {}

/** The request's IP → `ShopperRequest`. Never fails. */
export class Shopper extends RpcMiddleware.Service<Shopper, { provides: ShopperRequest }>()("api/Shopper") {}
