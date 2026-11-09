import { Conflict, Forbidden } from "@insyte/domain/Errors"
import {
  BeginConnect,
  MarketingList,
  MarketingStatus,
  SyncInput,
  SyncResult
} from "@insyte/modules/marketing/domain/Marketing"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Klaviyo (M7.5): whether the workspace has an account connected, connecting one (Instellingen at Beheren: the answer
 * is Klaviyo's approval page), letting it go, its lists, and sending customers to one (Klanten at Bewerken; only those
 * who said yes to marketing, after the undo window; a dry run only counts).
 */
export class MarketingRpcs extends RpcGroup.make(
  Rpc.make("Marketing.status", { success: MarketingStatus, error: Forbidden }),
  Rpc.make("Marketing.beginConnect", {
    payload: BeginConnect,
    success: Schema.Struct({ authorizeUrl: Schema.String }),
    error: Schema.Union([Forbidden, Conflict])
  }),
  Rpc.make("Marketing.disconnect", { error: Forbidden }),
  Rpc.make("Customers.marketingLists", {
    success: Schema.Array(MarketingList),
    error: Schema.Union([Forbidden, Conflict])
  }),
  Rpc.make("Customers.syncToMarketing", {
    payload: SyncInput,
    success: SyncResult,
    error: Schema.Union([Forbidden, Conflict])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
