import { Context, Schema } from "effect"
import { UserId, WorkspaceId } from "./Ids.ts"

/*
 * The signed-in person, before any workspace (M2.4). better-auth vouches for the user; which workspace and principal
 * they act as arrives in M3, and `Session.me` grows the principals then.
 */

const PERSON = {
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  emailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
  /** Whether sign-in asks for a TOTP or a backup code after the password (M2). */
  twoFactorEnabled: Schema.Boolean
}

/** The person as the console reads them: the session's own choice of workspace stays on the server. */
export const MeUser = Schema.Struct(PERSON)
export type MeUser = typeof MeUser.Type

export const SessionUser = Schema.Struct({
  ...PERSON,
  /**
   * The workspace this session acts in (`Workspaces.switch`, M3.1), read from the session's row on every request; set
   * on the session's first request inside a workspace and kept, so joining or making another one does not move it.
   * Never sent to the console: `Session.me` names the active principal instead.
   */
  activeWorkspaceId: Schema.optional(Schema.NullOr(WorkspaceId)),
  /** The session's id, for writing that choice on its own row. */
  sessionId: Schema.optional(Schema.String)
})
export type SessionUser = typeof SessionUser.Type

/** Provided by the `Authenticated` RPC middleware from the session cookie. */
export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()("domain/CurrentUser") {}

/**
 * One way the person may act, as the session lists it: a membership, a supplier's contact for a brand, or an
 * affiliate of a brand's programme (M16).
 */
export const PrincipalSummary = Schema.Struct({
  kind: Schema.Literals(["member", "supplier_contact", "affiliate"]),
  id: Schema.String,
  workspaceId: WorkspaceId,
  workspaceName: Schema.String,
  roleLabel: Schema.String,
  /** The supplier a contact acts for. */
  partnerName: Schema.optional(Schema.String)
})
export type PrincipalSummary = typeof PrincipalSummary.Type

/** What the console needs after sign-in: who, as whom, and where they land (widgets/01). */
export class SessionMe extends Schema.Class<SessionMe>("domain/SessionMe")({
  user: MeUser,
  /** Every principal the person may act as, newest first; empty before their first workspace. */
  principals: Schema.Array(PrincipalSummary),
  /** The one requests act as: the session's workspace (`Workspaces.switch`), else the newest membership. */
  activePrincipal: Schema.NullOr(PrincipalSummary),
  /**
   * `/onboarding` until the active workspace finished onboarding, then Start (`/dashboard`); the supplier portal
   * (`/supplier/dashboard`) for whoever is only a supplier's contact.
   */
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

/** Where the console goes after a switch: Start, or onboarding for a workspace still being set up. */
export class Switched extends Schema.Class<Switched>("domain/Switched")({
  workspaceId: WorkspaceId,
  landing: Schema.String
}) {}

/** Signs out one of the person's other sessions. Their current one signs out through better-auth. */
export const RevokeSession = Schema.Struct({ id: Schema.String })
export type RevokeSession = typeof RevokeSession.Type
