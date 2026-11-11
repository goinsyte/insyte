import { Forbidden, Invalid } from "@insyte/domain/Errors"
import { SecurityPolicy } from "@insyte/modules/workspaces/domain/Security"
import {
  Regional,
  SaveAccount,
  SaveRegional,
  SetAlerts,
  SetRetention,
  WorkspaceAccount
} from "@insyte/modules/workspaces/domain/Settings"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Refused = Schema.Union([Forbidden, Invalid])

/**
 * Instellingen → Account and Regio (M3.1): the workspace's facts, alert thresholds and retention, and its language and
 * notation; and Beveiliging's sign-in policy, read only for now. Reading takes Instellingen · Bekijken; changing
 * Bewerken, the retention Beheren. Not reachable by an API key (`settings` is `api: false`).
 */
export class WorkspacesRpcs extends RpcGroup.make(
  Rpc.make("Workspaces.getAccount", { success: WorkspaceAccount, error: Forbidden }),
  Rpc.make("Workspaces.saveAccount", { payload: SaveAccount, success: WorkspaceAccount, error: Refused }),
  Rpc.make("Workspaces.setAlerts", { payload: SetAlerts, success: WorkspaceAccount, error: Refused }),
  Rpc.make("Workspaces.setRetention", { payload: SetRetention, success: WorkspaceAccount, error: Refused }),
  Rpc.make("Workspaces.getRegional", { success: Regional, error: Forbidden }),
  Rpc.make("Workspaces.saveRegional", { payload: SaveRegional, success: Regional, error: Refused }),
  Rpc.make("Workspaces.getSecurity", { success: SecurityPolicy, error: Forbidden })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
