import { Forbidden, NotFound } from "@insyte/domain/Errors"
import { HealthView } from "@insyte/modules/stores/domain/Health"
import {
  BeginConnect,
  ShopifyUnavailable,
  ShopNotFound,
  StoreRef,
  StoreView,
  SyncStatus
} from "@insyte/modules/stores/domain/Stores"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Instellingen → Winkels and onboarding's store step (M6.2, M6.3): the workspace's stores, connecting a Shopify store
 * (the approval page's address; Shopify comes back to `/api/connect/shopify/callback`), its first import's progress,
 * and disconnecting one. Reading is
 * `settings` Bekijken, the rest Beheren; never reachable by a key (`settings` is `api: false`). `Connections.health`
 * (M17 step 6): every store's connection with its open incidents and what Insyte already tried, at `data` or
 * `integrations` Bekijken; a key reads it as `GET /v1/connections/health` with `data.read`.
 */
export class StoresRpcs extends RpcGroup.make(
  Rpc.make("Stores.list", { success: Schema.Array(StoreView), error: Forbidden }),
  Rpc.make("Stores.beginConnect", {
    payload: BeginConnect,
    success: Schema.Struct({ authorizeUrl: Schema.String }),
    error: Schema.Union([Forbidden, ShopifyUnavailable, ShopNotFound])
  }),
  Rpc.make("Stores.syncStatus", { payload: StoreRef, success: SyncStatus, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("Connections.health", { success: HealthView, error: Forbidden }),
  Rpc.make("Stores.disconnect", {
    payload: StoreRef,
    success: Schema.Array(StoreView),
    error: Schema.Union([Forbidden, NotFound])
  })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
