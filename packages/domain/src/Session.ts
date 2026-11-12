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

/**
 * One of the person's own signed-in sessions, as Instellingen → Beveiliging lists them (M3.3): the device it was opened
 * on, the country Cloudflare saw it from, and when it last renewed. `current` is the one asking.
 */
export class ActiveSession extends Schema.Class<ActiveSession>("domain/ActiveSession")({
  id: Schema.String,
  /** "Mac · Chrome" (`deviceOf`). */
  device: Schema.String,
  /** Two letters, or `null` when it is not known. */
  country: Schema.NullOr(Schema.String),
  /** When the session last renewed (at most daily) or was opened: ISO 8601. */
  lastActiveAt: Schema.String,
  current: Schema.Boolean
}) {}

/** Signs out one of the person's other sessions. Their current one signs out through better-auth. */
export const RevokeSession = Schema.Struct({ id: Schema.String })
export type RevokeSession = typeof RevokeSession.Type
