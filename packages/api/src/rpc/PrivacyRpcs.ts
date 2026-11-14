import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  ExportSchedule,
  Inventory,
  PrivacyRequests,
  RequestAccess,
  RequestDeletion,
  RequestErasure,
  RequestMade,
  SetExportSchedule,
  ShopperNotFound
} from "@insyte/modules/privacy/domain/Privacy"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Je gegevens (M17 step 5, PLAN 48): what the workspace holds, where and who reaches it, and the requests page.
 * Reading takes Instellingen · Bewerken. The workspace export, its schedule and the workspace's deletion are the
 * owner's (api.md `Workspaces.requestExport` / `requestDeletion`, kept under the catalogue's names); a shopper's access
 * package takes Exporteren and Klanten · Bekijken, erasing them Klanten · Beheren. Not reachable by an API key:
 * `settings` is `api: false`, and deleting the workspace is people-only (15, "api: false").
 */
export class PrivacyRpcs extends RpcGroup.make(
  Rpc.make("Privacy.inventory", { success: Inventory, error: Forbidden }),
  Rpc.make("Privacy.requests", { success: PrivacyRequests, error: Forbidden }),
  Rpc.make("Privacy.setExportSchedule", {
    payload: SetExportSchedule,
    success: Schema.Struct({ schedule: ExportSchedule }),
    error: Forbidden
  }),
  Rpc.make("Privacy.requestAccess", {
    payload: RequestAccess,
    success: RequestMade,
    error: Schema.Union([Forbidden, NotFound, ShopperNotFound])
  }),
  Rpc.make("Privacy.requestErasure", {
    payload: RequestErasure,
    success: RequestMade,
    error: Schema.Union([Forbidden, ShopperNotFound])
  }),
  Rpc.make("Workspaces.requestExport", { success: RequestMade, error: Forbidden }),
  Rpc.make("Workspaces.requestDeletion", {
    payload: RequestDeletion,
    success: RequestMade,
    error: Schema.Union([Forbidden, Invalid, Conflict])
  }),
  Rpc.make("Workspaces.cancelDeletion", { success: RequestMade, error: Schema.Union([Forbidden, Conflict]) })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
