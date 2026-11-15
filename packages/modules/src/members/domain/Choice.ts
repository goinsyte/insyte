import { WorkspaceId } from "@insyte/domain/Ids"
import { Schema } from "effect"

/*
 * The switcher's side of invitations (M3.4; widgets/01 "store and workspace selector"): an invitation to another
 * workspace, addressed to the signed-in person, shown as a row they accept or decline right there; and leaving a
 * workspace they do not own.
 */

export class WorkspaceInvite extends Schema.Class<WorkspaceInvite>("members/WorkspaceInvite")({
  id: Schema.String,
  workspaceId: WorkspaceId,
  workspace: Schema.String,
  invitedBy: Schema.String,
  /** The role's label there. */
  role: Schema.String,
  /** Active people in it now. */
  members: Schema.Int,
  /** `workspaces.plan`, and whether a subscription pays for it. */
  plan: Schema.String,
  paid: Schema.Boolean,
  /** Epoch ms. */
  sentAt: Schema.Finite
}) {}

/** One of those invitations, by id. */
export const InviteRef = Schema.Struct({ id: Schema.String })
export type InviteRef = typeof InviteRef.Type

/** "<werkruimte> verlaten". */
export const LeaveWorkspace = Schema.Struct({ workspaceId: WorkspaceId })
export type LeaveWorkspace = typeof LeaveWorkspace.Type
