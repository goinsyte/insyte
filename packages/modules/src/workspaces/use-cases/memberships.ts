import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, type Principal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { activate } from "../../shared/use-cases/ActiveWorkspace.ts"

/*
 * A person's memberships, each with its workspace and role: read as that person before any workspace is chosen
 * (`members_own`, `workspaces_member_of`, `roles_mine`). The first is the active principal everywhere it is read (the
 * RPCs' `Member`, the frame, the realtime socket, the upload routes): the workspace the session chose
 * (`Workspaces.switch`), then the rest newest first. A session whose choice is no longer a membership (left, removed,
 * deactivated) falls back to the newest.
 */

export interface Membership {
  readonly memberId: string
  readonly workspaceId: WorkspaceId
  readonly workspaceName: string
  /** The workspace finished onboarding: the session lands on Start rather than in onboarding. */
  readonly onboarded: boolean
  readonly principal: Principal
  /** The member's "last active" (Team) is unset or older than `ACTIVITY_EVERY`: `markActive` writes it now. */
  readonly activityDue: boolean
}

/**
 * How often a member's "last active" is written: once in five minutes at most, so a busy console does not write on
 * every call. Whether it is due comes with the membership read, so a call that is not due costs nothing more.
 */
const ACTIVITY_EVERY = "5 minutes"

interface Row {
  readonly id: string
  readonly workspaceId: WorkspaceId
  readonly workspaceName: string
  readonly onboarded: boolean
  readonly roleId: string
  readonly roleLabel: string
  readonly roleVersion: number
  readonly levels: Principal["role"]["levels"]
  readonly specials: Principal["role"]["specials"]
  readonly refundLimitMinor: string | number | null
  readonly roleStores: "all" | ReadonlyArray<string>
  readonly memberStores: "all" | ReadonlyArray<string>
  readonly activityDue: boolean
}

/** The member's stores narrow the role's, never widen them; `null` is every store. */
const storeScope = (role: Row["roleStores"], member: Row["memberStores"]): ReadonlyArray<string> | null =>
  role === "all" ? (member === "all" ? null : member) : member === "all" ? role : member.filter((s) => role.includes(s))

export const memberships = Effect.fn("Workspaces.memberships")(function*() {
  const user = yield* CurrentUser
  const db = yield* Db
  const rows = yield* db.forUser((sql) =>
    sql<Row>`
      select m.id, m.workspace_id, w.name as workspace_name,
             w.onboarding_completed_at is not null as onboarded, m.role_id, r.label as role_label, r.version as role_version,
             r.levels, r.specials, r.refund_limit_minor, r.stores as role_stores, m.stores as member_stores,
             coalesce(m.last_active_at < now() - ${ACTIVITY_EVERY}::interval, true) as activity_due
      from members m
      join workspaces w on w.id = m.workspace_id
      join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
      where m.user_id = ${user.id} and m.deactivated_at is null and m.removed_at is null
      order by coalesce(m.workspace_id = ${user.activeWorkspaceId ?? null}, false) desc, m.joined_at desc, m.id`
  )
  return rows.map((row): Membership => ({
    memberId: row.id,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    onboarded: row.onboarded,
    principal: {
      kind: "member",
      id: row.id,
      userId: user.id,
      workspaceId: row.workspaceId,
      partnerId: null,
      role: {
        id: row.roleId,
        label: row.roleLabel,
        version: row.roleVersion,
        levels: row.levels,
        specials: row.specials,
        refundLimit: row.refundLimitMinor === null ? null : Number(row.refundLimitMinor) / 100,
        stores: row.roleStores === "all" ? "all" : [...row.roleStores]
      },
      storeScope: storeScope(row.roleStores, row.memberStores)
    },
    activityDue: row.activityDue
  }))
})

/**
 * Where a session acting in this membership lands: Start, once the workspace finished onboarding or for whoever joined
 * it; onboarding (which resumes where it was) for its founder until then.
 */
export const landingOf = (m: Membership) =>
  m.onboarded || m.principal.role.id !== "owner" ? "/dashboard" : "/onboarding"

/**
 * `memberships`, with the session held to the first (`Session.me` and the RPCs' `Member`): a session that has chosen
 * no workspace yet, or whose choice is no longer a membership, is pinned to the one it now acts in. From then on,
 * joining or making another workspace does not move it; only a switch does.
 */
export const current = Effect.fn("Workspaces.current")(function*() {
  const user = yield* CurrentUser
  const mine = yield* memberships()
  const first = mine[0]
  if (first !== undefined && user.sessionId !== undefined && first.workspaceId !== user.activeWorkspaceId) {
    const session = { id: user.sessionId, userId: user.id }
    yield* (yield* Db).routing((sql) => activate(sql, session, first.workspaceId))
  }
  return mine
})

/**
 * The member was active just now (Team's "Laatst actief"), when their membership says it is due: one statement on
 * their own row, held to `ACTIVITY_EVERY` again so that calls at the same moment write it once. Bookkeeping, never the
 * call's business: a failure is logged and the call goes on.
 */
export const markActive = (membership: Membership) =>
  membership.activityDue
    ? Effect.flatMap(Effect.service(Db), (db) =>
      db.scoped((sql) =>
        sql`update members set last_active_at = now()
            where id = ${membership.memberId}
              and (last_active_at is null or last_active_at < now() - ${ACTIVITY_EVERY}::interval)`
      )).pipe(
        Effect.provideService(CurrentPrincipal, membership.principal),
        Effect.asVoid,
        Effect.catchCause((cause) => Effect.logWarning("member activity not recorded", { cause })),
        Effect.withSpan("Workspaces.markActive")
      )
    : Effect.void
