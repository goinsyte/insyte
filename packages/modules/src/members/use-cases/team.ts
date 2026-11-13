import { Db } from "@insyte/database/Db"
import { canRole } from "@insyte/domain/Permissions"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { seatsOf } from "../../shared/domain/Billing.ts"
import { narrowStores, withinScope } from "../../shared/domain/Stores.ts"
import { InvitationLinks } from "../domain/Ports.ts"
import { InviteLink, PendingInvitation, Seats, type StoreAccess, Team, TeamMember, TeamRole } from "../domain/Team.ts"

/*
 * The team page, read on the caller's transaction inside the workspace (`Members.get`, and every write's answer).
 * People who were removed are gone from it; deactivated people stay, greyed out, and free their seat.
 */

interface MemberRow {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly roleId: string
  readonly roleLabel: string
  readonly stores: StoreAccess
  readonly invitedBy: string | null
  readonly joinedAt: Date
  readonly lastActiveAt: Date | null
  readonly deactivated: boolean
}

interface InvitationRow {
  readonly id: string
  readonly email: string
  readonly roleId: string
  readonly stores: StoreAccess | null
  readonly message: string | null
  readonly invitedBy: string
  readonly sentAt: Date
  readonly expiresAt: Date
  readonly round: number
}

interface LinkRow {
  readonly enabled: boolean
  readonly round: number
  readonly roleId: string
  readonly days: 1 | 7 | 30
  readonly createdAt: Date
  readonly expiresAt: Date
  readonly joinedCount: number
}

/** The seats, as `Seats`: active people plus open invitations that have not lapsed, against the plan's seats. */
export const seatsIn = Effect.fn("Members.seats")(function*(sql: SqlClient.SqlClient) {
  const [row] = yield* sql<{ plan: string; active: number; pending: number }>`
    select w.plan,
           (select count(*)::int from members where removed_at is null and deactivated_at is null) as active,
           (select count(*)::int from invitations
              where accepted_at is null and revoked_at is null and declined_at is null and expires_at > now()) as pending
    from workspaces w`
  const total = seatsOf(row?.plan ?? "trial")
  const active = row?.active ?? 0
  const pending = row?.pending ?? 0
  const used = active + pending
  return new Seats({ total, used, active, pending, free: Math.max(0, total - used), full: used >= total })
})

interface RoleRow {
  readonly id: string
  readonly label: string
  readonly kind: string
  readonly levels: TeamRole["levels"]
  readonly specials: TeamRole["specials"]
  readonly refundLimitMinor: string | number | null
  readonly stores: StoreAccess
}

export const readTeam = Effect.fn("Members.readTeam")(function*(sql: SqlClient.SqlClient) {
  const principal = yield* CurrentPrincipal
  const links = yield* InvitationLinks
  // The links are for whoever may invite: a reader of the team sees who is asked, not how to get in.
  const role = principal.role
  const mayInvite = canRole({ ...role, stores: role.stores === "all" ? "all" : [...role.stores] }, "team", 2)
  const members = yield* sql<MemberRow>`
    select m.id, u.name, u.email, m.role_id, r.label as role_label, m.stores, m.invited_by, m.joined_at,
           m.last_active_at, m.deactivated_at is not null as deactivated
    from members m
    join auth."user" u on u.id = m.user_id
    join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
    where m.removed_at is null
    order by m.joined_at, m.id`
  // Open invitations, lapsed ones included: the page offers to send those again.
  const invitations = yield* sql<InvitationRow>`
    select id, email, role_id, stores, message, invited_by, sent_at, expires_at, round
    from invitations
    where kind = 'team' and accepted_at is null and revoked_at is null and declined_at is null
    order by sent_at, id`
  const [link] = yield* sql<LinkRow>`
    select enabled, round, role_id, days, created_at, expires_at, joined_count from invite_links`
  const seats = yield* seatsIn(sql)
  const roles = yield* sql<RoleRow>`
    select id, label, kind, levels, specials, refund_limit_minor, stores from roles
    order by id <> 'owner', kind <> 'system', created_at, id`
  const now = Date.now()
  // Someone held to some stores is shown no way in for anyone who would reach further than they do.
  const rolesStores = new Map(roles.map((r) => [r.id, r.stores]))
  const opens = (roleId: string, stores: StoreAccess) =>
    mayInvite && withinScope(narrowStores(rolesStores.get(roleId) ?? "all", stores), principal.storeScope)
  return new Team({
    me: principal.id,
    members: members.map((m) =>
      new TeamMember({
        id: m.id,
        name: m.name,
        email: m.email,
        roleId: m.roleId,
        roleLabel: m.roleLabel,
        stores: m.stores,
        invitedBy: m.invitedBy,
        joinedAt: m.joinedAt.getTime(),
        lastActiveAt: m.lastActiveAt?.getTime() ?? null,
        deactivated: m.deactivated
      })
    ),
    invitations: yield* Effect.forEach(
      invitations,
      (i) =>
        Effect.map(
          opens(i.roleId, i.stores ?? "all") ? links.invitation(i.id, i.round) : Effect.succeed(null),
          (minted) =>
            new PendingInvitation({
              id: i.id,
              email: i.email,
              roleId: i.roleId,
              stores: i.stores ?? "all",
              message: i.message,
              invitedBy: i.invitedBy,
              sentAt: i.sentAt.getTime(),
              expiresAt: i.expiresAt.getTime(),
              resent: i.round,
              url: minted?.url ?? null
            })
        )
    ),
    seats,
    link: link === undefined
      ? new InviteLink({
        enabled: false,
        token: null,
        roleId: "view",
        days: 7,
        createdAt: now,
        expiresAt: now + 7 * 86_400_000,
        joined: 0,
        url: null
      })
      : yield* Effect.map(links.shareable(principal.workspaceId, link.round), (minted) =>
        new InviteLink({
          enabled: link.enabled,
          token: opens(link.roleId, "all") ? minted.token : null,
          url: opens(link.roleId, "all") ? minted.url : null,
          roleId: link.roleId,
          days: link.days,
          createdAt: link.createdAt.getTime(),
          expiresAt: link.expiresAt.getTime(),
          joined: link.joinedCount
        })),
    roles: roles.map((r) =>
      new TeamRole({
        id: r.id,
        label: r.label,
        system: r.kind === "system",
        levels: r.levels,
        specials: r.specials,
        refundLimit: r.refundLimitMinor === null ? null : Number(r.refundLimitMinor) / 100,
        stores: r.stores
      })
    )
  })
})

/** `Members.get`: the team page, for anyone who may see the team. */
export const get = Effect.fn("Members.get")(function*() {
  yield* Policy.require("team", 1)
  const db = yield* Db
  return yield* db.scoped(readTeam)
})
