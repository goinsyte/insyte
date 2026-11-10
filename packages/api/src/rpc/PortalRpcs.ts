import { Invalid } from "@insyte/domain/Errors"
import {
  HumanCheckFailed,
  OrderNotFound,
  PhotoRequired,
  PortalLookupInput,
  PortalNotFound,
  PortalOrder,
  PortalRateLimited,
  PortalStarted,
  PortalStartInput,
  PortalStore,
  PortalStoreInput,
  PortalTokenExpired
} from "@insyte/modules/returns/domain/Portal"
import { LineNotReturnable, ResolutionNotAllowed } from "@insyte/modules/returns/domain/Returns"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Shopper } from "./Shopper.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The public returns portal, `/retour/<handle>` (M9.3), for a shopper without an account: the store's page, finding an
 * order (Turnstile, and limits per IP and per order), and the request. Photos go up beside it, `PUT /api/portal/photos`.
 */
export class PortalRpcs extends RpcGroup.make(
  Rpc.make("Portal.store", { payload: PortalStoreInput, success: PortalStore, error: PortalNotFound }),
  Rpc.make("Portal.lookup", {
    payload: PortalLookupInput,
    success: PortalOrder,
    error: Schema.Union([PortalNotFound, OrderNotFound, PortalRateLimited, HumanCheckFailed])
  }),
  Rpc.make("Portal.start", {
    payload: PortalStartInput,
    success: PortalStarted,
    error: Schema.Union([
      PortalNotFound,
      PortalTokenExpired,
      PortalRateLimited,
      Invalid,
      PhotoRequired,
      LineNotReturnable,
      ResolutionNotAllowed
    ])
  })
).middleware(Shopper).middleware(WithDb) {}
