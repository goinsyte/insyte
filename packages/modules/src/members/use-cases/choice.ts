import { Db } from "@insyte/database/Db"
import { Conflict, NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import { release } from "../../shared/use-cases/ActiveWorkspace.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { WorkspaceInvite } from "../domain/Choice.ts"
import { acceptRouted, declineRouted } from "./invitations/accept.ts"
import type { Route } from "./invitations/route.ts"

/*
 * What the person does with their own memberships from the switcher (M3.1, M3.4), as the person rather than as a
 * principal: the invitations to another workspace (found by the signed-in, verified address, `invitations_to_user`,
 * 0096), accepting or declining one there, the undo of a decline, and leaving a workspace. Each reads and writes inside
 * the workspace concerned (`asUserIn`), as the landing does.
 */

/** The workspace of an invitation to the signed-in address; nothing for anyone else's. */
const mine = Effect.fn("Members.myInvitation")(function*(id: string) {
  const db = yield* Db
  const [row] = yield* db.forUser((sql) =>
    sql<{ workspaceId: string | null }>`select invitation_route_for_user(${id}) as workspace_id`
  )
  return row?.workspaceId == null ? undefined : ({ workspaceId: row.workspaceId, link: false } satisfies Route)
})

interface InviteRow {
  readonly id: string
  readonly workspace: string
  readonly invitedBy: string
  readonly role: string
  readonly members: string | number
  readonly plan: string
  readonly paid: boolean
  readonly sentAt: Date
}

/** `Workspaces.listInvites`: the open team invitations to the person's address, newest first. */
export const invitesToMe = Effect.fn("Members.invitesToMe")(function*() {
  const user = yield* CurrentUser
  const db = yield* Db
  const routed = yield* db.forUser((sql) =>
    sql<{ invitationId: string; workspaceId: string }>`select invitation_id, workspace_id from invitations_to_user()`
  )
  const rows = yield* Effect.forEach(routed, (r) =>
    db.asUserIn(r.workspaceId as WorkspaceId)((sql) =>
      sql<InviteRow>`
        select i.id, w.name as workspace, u.name as invited_by, r.label as role,
               (select count(*) from members x where x.workspace_id = w.id and x.deactivated_at is null and x.removed_at is null)
                 as members,
               w.plan, exists (select 1 from subscriptions s where s.workspace_id = w.id and s.status in ('active', 'trialing', 'past_due'))
                 as paid,
               i.sent_at
        from invitations i
        join workspaces w on w.id = i.workspace_id
        join members m on m.id = i.invited_by
        join auth."user" u on u.id = m.user_id
        join roles r on r.workspace_id = i.workspace_id and r.id = i.role_id
        where i.id = ${r.invitationId}
          and not exists (select 1 from members me
                          where me.workspace_id = i.workspace_id and me.user_id = ${user.id} and me.removed_at is null)`
    ).pipe(Effect.map((found) => found.map((row) => ({ ...row, workspaceId: r.workspaceId })))), { concurrency: 1 })
  return rows.flat().map((row) =>
    new WorkspaceInvite({
      id: row.id,
      workspaceId: row.workspaceId as WorkspaceId,
      workspace: row.workspace,
      invitedBy: row.invitedBy,
      role: row.role,
      members: Number(row.members),
      plan: row.plan,
      paid: row.paid,
      sentAt: row.sentAt.getTime()
    })
  )
})

/** "Accepteren": as the landing accepts, with the seats and sign-in policy checked now. */
export const acceptMine = Effect.fn("Members.acceptMine")(function*(id: string) {
  return yield* acceptRouted({ id }, yield* mine(id))
})

/** "Weigeren": as the landing declines; the seat frees up and the mail still waiting is cancelled. */
export const declineMine = Effect.fn("Members.declineMine")(function*(id: string) {
  yield* declineRouted({ id }, yield* mine(id))
})

/**
 * The decline's undo, inside the undo window: the invitation is open again, unless it lapsed, was revoked or replaced
 * meanwhile. The mail the decline cancelled stays cancelled: the person has the invitation in front of them.
 */
export const restoreMine = Effect.fn("Members.restoreMine")(function*(id: string) {
  const user = yield* CurrentUser
  const db = yield* Db
  const found = yield* mine(id)
  if (found === undefined) return yield* new NotFound({ entity: "invitation", id })
  yield* db.asUserIn(found.workspaceId as WorkspaceId)((sql) =>
    Effect.gen(function*() {
      const back = yield* sql<{ id: string }>`
        update invitations i set declined_at = null
        where i.id = ${id} and i.declined_at > now() - make_interval(secs => ${UNDO_SECONDS * 4})
          and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
          and not exists (select 1 from invitations o
                          where o.workspace_id = i.workspace_id and o.kind = i.kind and o.email = i.email
                            and o.id <> i.id and o.accepted_at is null and o.revoked_at is null and o.declined_at is null)
        returning i.id`
      if (back.length === 0) return yield* new Conflict({ entity: "invitation", reason: "gone" })
      yield* Audit.write(sql, found.workspaceId, { kind: "system", id: "landing", onBehalfOf: user.id }, {
        action: "member.invitation_restored",
        subjectType: "invitation",
        subjectId: id
      })
    })
  )
})

/**
 * "<werkruimte> verlaten" (widgets/01): the person leaves a workspace they do not own. Their row is removed and marked
 * as left (`left_at`): the seat frees up, what they did keeps their name, and only a new invitation brings them back
 * (no undo; the design's confirmation says so). The owner cannot leave: they hand the workspace over first. A session
 * acting in it goes back to the newest membership.
 */
export const leave = Effect.fn("Members.leave")(function*(sessionId: string, workspaceId: WorkspaceId) {
  const user = yield* CurrentUser
  const db = yield* Db
  yield* db.asUserIn(workspaceId)((sql) =>
    Effect.gen(function*() {
      const [me] = yield* sql<{ id: string; roleId: string }>`
        select id, role_id from members
        where user_id = ${user.id} and removed_at is null and deactivated_at is null for update`
      if (me === undefined) return yield* new NotFound({ entity: "workspace", id: workspaceId })
      if (me.roleId === "owner") return yield* new Conflict({ entity: "workspace", reason: "owner" })
      yield* sql`update members set removed_at = now(), left_at = now() where id = ${me.id}`
      yield* Audit.write(sql, workspaceId, { kind: "member", id: me.id }, {
        action: "member.left",
        subjectType: "member",
        subjectId: me.id
      })
      yield* release(sql, { id: sessionId, userId: user.id }, workspaceId)
    })
  )
})
