import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { Inventory, PrivacyRequests } from "@insyte/modules/privacy/domain/Privacy"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { ROLES } from "./roles.ts"
import { TEAM } from "./team.ts"

/*
 * Instellingen → Je gegevens (M17 step 5, PLAN 48): what the workspace holds and the requests page, each primed by the
 * route's loader and carried in the document. Every write names `PRIVACY`, and so does a request that changes state
 * in the background (`records.changed` of kind `gdpr_request`), so the page reads again when an export is ready. A
 * role or a member changed is who-sees-what changed, so the inventory reads those keys too.
 */

export const PRIVACY = ["privacy"] as const

const readErrors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const inventoryAtom = Atom.serializable(
  ConsoleClient.query("Privacy.inventory", undefined, { reactivityKeys: [...PRIVACY, ...ROLES, ...TEAM] }),
  {
    key: "privacy-inventory",
    schema: AsyncResult.Schema({ success: Inventory, error: readErrors }),
    skipInitialRun: true
  }
)

export const requestsAtom = Atom.serializable(
  ConsoleClient.query("Privacy.requests", undefined, { reactivityKeys: PRIVACY }),
  {
    key: "privacy-requests",
    schema: AsyncResult.Schema({ success: PrivacyRequests, error: readErrors }),
    skipInitialRun: true
  }
)

export const privacyWrites = {
  setSchedule: ConsoleClient.mutation("Privacy.setExportSchedule"),
  requestAccess: ConsoleClient.mutation("Privacy.requestAccess"),
  requestErasure: ConsoleClient.mutation("Privacy.requestErasure"),
  requestExport: ConsoleClient.mutation("Workspaces.requestExport"),
  requestDeletion: ConsoleClient.mutation("Workspaces.requestDeletion"),
  cancelDeletion: ConsoleClient.mutation("Workspaces.cancelDeletion")
} as const
