import type { SessionUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Landing, type LandingRef, type LandingRole, type LandingState } from "../../domain/Landing.ts"
import type { StoreAccess } from "../../domain/Team.ts"
import { seatsIn } from "../team.ts"
import type { Route } from "./route.ts"

/*
 * The landing's classification (domain.md §2.5): a pure reading of the invitation (or the link), whoever is signed in,
 * and the workspace's seats and sign-in policy, on a transaction already in the invitation's workspace. Its order is
 * the page's: a link that no longer works says so first; then someone else signed in; then the workspace's own
 * conditions; then whether the invitee has an account.
 */

export const MISSING = new Landing({
  state: "missing",
  workspace: null,
  inviter: null,
  email: null,
  name: null,
  role: null,
  stores: "all",
  message: null,
  at: null,
  signedInAs: null,
  seats: null,
  requested: false
})

interface SsoPolicy {
  readonly kind: string
  readonly domains?: ReadonlyArray<string>
}

/** The workspace signs in through Google Workspace for this address's domain. */
export const ssoRequired = (policy: SsoPolicy, email: string) =>
  policy.kind === "google" && (policy.domains ?? []).includes(email.slice(email.lastIndexOf("@") + 1).toLowerCase())

const roleOf = (sql: SqlClient.SqlClient, roleId: string) =>
  Effect.map(
    sql<LandingRole>`select id, label, levels, specials from roles where id = ${roleId}`,
    ([role]) => role ?? null
  )

/** Whoever the page speaks of as the one who asked: the inviter, or for the shareable link the owner. */
const personOf = (sql: SqlClient.SqlClient, memberId: string | null) =>
  Effect.map(
    sql<{ name: string; role: string }>`
      select u.name, r.label as role from members m
      join auth."user" u on u.id = m.user_id
      join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
      where ${memberId === null ? sql`m.role_id = 'owner'` : sql`m.id = ${memberId}`}`,
    ([person]) => person ?? null
  )

const workspaceOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ name: string; ssoPolicy: SsoPolicy }>`select name, sso_policy from workspaces`,
    ([w]) => w
  )

/** The person is already in this workspace. */
export const isMember = (sql: SqlClient.SqlClient, userId: string) =>
  Effect.map(
    sql<{ id: string }>`select id from members where user_id = ${userId} and removed_at is null`,
    (rows) => rows.length > 0
  )

interface InvitationRow {
  readonly email: string
  readonly name: string | null
  readonly roleId: string
  readonly stores: StoreAccess | null
  readonly message: string | null
  readonly invitedBy: string
  readonly expiresAt: Date
  readonly acceptedAt: Date | null
  readonly gone: boolean
  readonly lapsed: boolean
  readonly requestedNew: boolean
  readonly seatRequested: boolean
}

export const classify = Effect.fn("Landing.classify")(function*(
  sql: SqlClient.SqlClient,
  ref: LandingRef,
  route: Route,
  viewer: SessionUser | null
) {
  const workspace = yield* workspaceOf(sql)
  if (workspace === undefined) return MISSING
  const seats = yield* seatsIn(sql)
  const signedInAs = viewer?.email.toLowerCase() ?? null

  if (route.link) {
    const [link] = yield* sql<{ enabled: boolean; roleId: string; expiresAt: Date; lapsed: boolean }>`
      select enabled, role_id, expires_at, expires_at <= now() as lapsed from invite_links`
    if (link === undefined) return MISSING
    const state: LandingState = !link.enabled || link.lapsed
      ? "expired"
      : viewer !== null && (yield* isMember(sql, viewer.id))
      ? "accepted"
      : seats.full
      ? "full"
      : "link"
    return new Landing({
      state,
      workspace: workspace.name,
      inviter: yield* personOf(sql, null),
      email: null,
      name: null,
      role: yield* roleOf(sql, link.roleId),
      stores: "all",
      message: null,
      at: link.expiresAt.getTime(),
      signedInAs,
      seats: seats.total,
      requested: false
    })
  }

  const [inv] = yield* sql<InvitationRow>`
    select email, name, role_id, stores, message, invited_by, expires_at, accepted_at,
           revoked_at is not null or declined_at is not null as gone, expires_at <= now() as lapsed,
           requested_new_at is not null as requested_new, seat_requested_at is not null as seat_requested
    from invitations where id = ${ref.id} and kind = 'team'`
  if (inv === undefined) return MISSING
  // Only the seats beyond those already taken: an open invitation holds its own seat until it lapses.
  const full = seats.active >= seats.total
  const exists = signedInAs === inv.email ||
    (yield* sql<{ id: string }>`select id from auth."user" where email = ${inv.email}`).length > 0
  const state: LandingState = inv.gone
    ? "revoked"
    : inv.acceptedAt !== null
    ? "accepted"
    : inv.lapsed
    ? "expired"
    : signedInAs !== null && signedInAs !== inv.email
    ? "other-account"
    : ssoRequired(workspace.ssoPolicy, inv.email)
    ? "sso"
    : full
    ? "full"
    : exists
    ? "existing"
    : "new"
  return new Landing({
    state,
    workspace: workspace.name,
    inviter: yield* personOf(sql, inv.invitedBy),
    email: inv.email,
    name: inv.name,
    role: yield* roleOf(sql, inv.roleId),
    stores: inv.stores ?? "all",
    message: inv.message,
    at: (inv.acceptedAt ?? inv.expiresAt).getTime(),
    signedInAs,
    seats: seats.total,
    requested: state === "expired" ? inv.requestedNew : state === "full" ? inv.seatRequested : false
  })
})
