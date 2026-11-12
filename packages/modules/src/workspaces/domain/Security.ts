import { Schema } from "effect"

/*
 * Instellingen → Beveiliging's Authenticatie (M3.1, M3.3; widgets/05 §2.4): the workspace's sign-in policy and the
 * reader's own second step. Read only for now: enrolling in two-factor needs a step the design does not have yet, and
 * a policy that requires it or Google Workspace waits for that and for its enforcement at sign-in (`setSecurity`).
 */

export class SecurityPolicy extends Schema.Class<SecurityPolicy>("workspaces/SecurityPolicy")({
  /** Every member must sign in with a second step (`workspaces.require_mfa`). */
  requireMfa: Schema.Boolean,
  /** Members sign in through Google Workspace (`workspaces.sso_policy` is not `off`). */
  googleSso: Schema.Boolean,
  /** Whether the reader signs in with a second step themselves. */
  twoFactorEnabled: Schema.Boolean
}) {}
