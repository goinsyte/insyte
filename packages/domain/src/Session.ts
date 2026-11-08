import { Context, Schema } from "effect"
import { UserId, WorkspaceId } from "./Ids.ts"

/*
 * The signed-in person, before any workspace (M2.4). better-auth vouches for the user; which workspace and principal
 * they act as arrives in M3, and `Session.me` grows the principals then.
 */

export const SessionUser = Schema.Struct({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  emailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
  /** Whether sign-in asks for a TOTP or a backup code after the password (M2). */
  twoFactorEnabled: Schema.Boolean
})
export type SessionUser = typeof SessionUser.Type

/** Provided by the `Authenticated` RPC middleware from the session cookie. */
export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()("domain/CurrentUser") {}

/** One way the person may act, as the session lists it: today a membership; partner principals join in M16. */
export const PrincipalSummary = Schema.Struct({
  kind: Schema.Literal("member"),
  id: Schema.String,
  workspaceId: WorkspaceId,
  workspaceName: Schema.String,
  roleLabel: Schema.String
})
export type PrincipalSummary = typeof PrincipalSummary.Type

/** What the console needs after sign-in: who, as whom, and where they land (widgets/01). */
export class SessionMe extends Schema.Class<SessionMe>("domain/SessionMe")({
  user: SessionUser,
  /** Every principal the person may act as, newest first; empty before their first workspace. */
  principals: Schema.Array(PrincipalSummary),
  /** The one requests act as: the session's choice, else the newest (`Session.switchPrincipal` arrives with a second). */
  activePrincipal: Schema.NullOr(PrincipalSummary),
  /** `/onboarding` until the active workspace finished onboarding, then Start (`/dashboard`). */
  landing: Schema.String
}) {}

/**
 * Whoever opened a public page: the signed-in person, or nobody. Provided by the `Viewer` RPC middleware, for the
 * pages that answer differently to the person they are for (the invitation landing).
 */
export class CurrentViewer extends Context.Service<CurrentViewer, { readonly user: SessionUser | null }>()(
  "domain/CurrentViewer"
) {}
