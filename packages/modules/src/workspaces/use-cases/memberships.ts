import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import type { Principal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"

/*
 * A person's memberships, newest first, each with its workspace and role: read as that person before any workspace is
 * chosen (`members_own`, `workspaces_member_of`, `roles_mine`). The first is the active principal until the session
 * names another (`Session.switchPrincipal`, with a second workspace).
 */

export interface Membership {
  readonly memberId: string
  readonly workspaceId: WorkspaceId
  readonly workspaceName: string
  /** The workspace finished onboarding: the session lands on Start rather than in onboarding. */
  readonly onboarded: boolean
  readonly principal: Principal
}

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
             r.levels, r.specials, r.refund_limit_minor, r.stores as role_stores, m.stores as member_stores
      from members m
      join workspaces w on w.id = m.workspace_id
      join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
      where m.user_id = ${user.id} and m.deactivated_at is null and m.removed_at is null
      order by m.joined_at desc`
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
    }
  }))
})
