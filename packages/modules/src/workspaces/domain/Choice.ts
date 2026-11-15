import { WorkspaceId } from "@insyte/domain/Ids"
import { Schema } from "effect"

/*
 * The workspaces a person is in, as the switcher lists them (M3.1; widgets/01 "store and workspace selector"): each
 * with the person's role there, how many people work in it and its plan, and which one the session acts in.
 */

export class WorkspaceSummary extends Schema.Class<WorkspaceSummary>("workspaces/WorkspaceSummary")({
  id: WorkspaceId,
  name: Schema.String,
  /** The person's member id there: the principal `Session.switchPrincipal` names. */
  memberId: Schema.String,
  /** Their role's label there. */
  role: Schema.String,
  /** They own it: they cannot leave it without handing it over first. */
  own: Schema.Boolean,
  /** Active people, the person included. */
  members: Schema.Int,
  /** `workspaces.plan`: a plan id, or `trial` before one was picked. */
  plan: Schema.String,
  /** A subscription pays for the plan; otherwise the workspace is on its trial. */
  paid: Schema.Boolean,
  /** The workspace finished onboarding; one that did not opens onboarding where it was left. */
  onboarded: Schema.Boolean,
  /** The session acts in it now. */
  active: Schema.Boolean
}) {}

/** "Openen" on a workspace in the switcher. */
export const SwitchWorkspace = Schema.Struct({ workspaceId: WorkspaceId })
export type SwitchWorkspace = typeof SwitchWorkspace.Type
