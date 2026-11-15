import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import { Switched } from "@insyte/domain/Session"
import { InviteRef, LeaveWorkspace, WorkspaceInvite } from "@insyte/modules/members/domain/Choice"
import { Accepted, NotAcceptable } from "@insyte/modules/members/domain/Landing"
import { Team } from "@insyte/modules/members/domain/Team"
import { NotCurrentStep } from "@insyte/modules/onboarding/domain/Onboarding"
import { CreateWorkspaceInput } from "@insyte/modules/shared/domain/Workspaces"
import { SwitchWorkspace, WorkspaceSummary } from "@insyte/modules/workspaces/domain/Choice"
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
  Rpc.make("Workspaces.getSecurity", { success: SecurityPolicy, error: Forbidden }),
  // Owner only, to an active member; the former owner becomes Beheerder. Irreversible: no undo (M3).
  Rpc.make("Workspaces.transferOwnership", {
    payload: Schema.Struct({ memberId: Schema.String }),
    success: Team,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

/**
 * The person's workspaces (M3.1, M3.4): the switcher's list, making another, switching, leaving one, and the
 * invitations to another one with what is done with them there. The person's own, before and beside any workspace, so
 * no role gates them; each refuses a workspace or invitation that is not theirs as no such thing.
 */
export class WorkspaceChoiceRpcs extends RpcGroup.make(
  Rpc.make("Workspaces.list", { success: Schema.Array(WorkspaceSummary) }),
  Rpc.make("Workspaces.create", {
    payload: CreateWorkspaceInput,
    success: Switched,
    error: Schema.Union([Invalid, NotCurrentStep])
  }),
  Rpc.make("Workspaces.switch", { payload: SwitchWorkspace, success: Switched, error: NotFound }),
  Rpc.make("Workspaces.leave", { payload: LeaveWorkspace, error: Schema.Union([NotFound, Conflict]) }),
  Rpc.make("Workspaces.listInvites", { success: Schema.Array(WorkspaceInvite) }),
  Rpc.make("Workspaces.acceptInvite", { payload: InviteRef, success: Accepted, error: NotAcceptable }),
  Rpc.make("Workspaces.declineInvite", { payload: InviteRef, error: NotAcceptable }),
  Rpc.make("Workspaces.restoreInvite", { payload: InviteRef, error: Schema.Union([NotFound, Conflict]) })
).middleware(Authenticated).middleware(WithDb) {}
