import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AppDetail,
  AppRef,
  Catalog,
  InstallResult,
  InstallView,
  ScopesChange,
  SendFeedback,
  SetScopes,
  UninstallResult
} from "@insyte/modules/marketplace/domain/Marketplace"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The Marketplace (M17 step 3): the catalogue, the workspace's installs and what suits it, opening an app and writing
 * feedback for every member; installing, uninstalling and taking scopes back for Koppelingen at Bewerken (a recipe
 * app's key at Beheren). Koppelingen is `api: false`, so none of this is on `/v1` or MCP.
 */
export class MarketplaceRpcs extends RpcGroup.make(
  Rpc.make("Marketplace.catalog", { success: Catalog }),
  Rpc.make("Marketplace.installs", { success: Schema.Array(InstallView) }),
  Rpc.make("Marketplace.get", { payload: AppRef, success: AppDetail, error: NotFound }),
  Rpc.make("Marketplace.recommended", { success: Schema.Array(Schema.String) }),
  Rpc.make("Marketplace.install", {
    payload: AppRef,
    success: InstallResult,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict])
  }),
  Rpc.make("Marketplace.uninstall", {
    payload: AppRef,
    success: UninstallResult,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Marketplace.setScopes", {
    payload: SetScopes,
    success: ScopesChange,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict])
  }),
  Rpc.make("Marketplace.open", { payload: AppRef, success: InstallView, error: NotFound }),
  Rpc.make("Marketplace.feedback", { payload: SendFeedback, error: Invalid })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
