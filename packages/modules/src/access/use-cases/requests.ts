import { Db } from "@insyte/database/Db"
import { Conflict, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { type AreaId, canRole, clampLevel, type Level } from "@insyte/domain/Permissions"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { AccessRequest, AlreadyAllowed, type RequestAccess } from "../domain/Access.ts"

/*
 * The access requests (M3.5): asking and taking it back as the member; listing, granting and declining as whoever may
 * manage the team. Granting raises the area on the role the asker held when they asked, clamped to the levels the area
 * has, and bumps the role's version so every session holding it reads it again. The owner's role is never changed.
 */

interface Row {
  readonly id: string
  readonly memberId: string
  readonly memberName: string
  readonly roleId: string
  readonly roleLabel: string
  readonly area: AccessRequest["area"]
  readonly level: AccessRequest["level"]
  readonly path: string | null
  readonly state: AccessRequest["state"]
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly createdAt: Date
}

const toRequest = (r: Row) =>
  new AccessRequest({
    id: r.id,
    memberId: r.memberId,
    memberName: r.memberName,
    roleId: r.roleId,
    roleLabel: r.roleLabel,
    area: r.area,
    level: r.level,
    path: r.path,
    state: r.state,
    decidedBy: r.decidedBy,
    decidedAt: r.decidedAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime()
  })

/** Requests with who asked and the role's label; `mine` narrows to the principal's own. */
const select = (sql: SqlClient.SqlClient, filter: { readonly memberId?: string; readonly id?: string }) =>
  Effect.map(
    sql<Row>`
      select a.id, a.member_id, u.name as member_name, a.role_id, coalesce(r.label, a.role_id) as role_label, a.area,
             a.level, a.path, a.state, a.decided_by, a.decided_at, a.created_at
      from access_requests a
      join members m on m.id = a.member_id
      join auth."user" u on u.id = m.user_id
      left join roles r on r.workspace_id = a.workspace_id and r.id = a.role_id
      where ${filter.memberId === undefined ? sql`true` : sql`a.member_id = ${filter.memberId}`}
        and ${filter.id === undefined ? sql`true` : sql`a.id = ${filter.id}`}
        and (a.state = 'open' or a.created_at > now() - interval '30 days')
      order by a.state <> 'open', a.created_at desc
      limit 200`,
    (rows) => rows.map(toRequest)
  )

const actor = Effect.map(Effect.service(CurrentPrincipal), (p) => ({ kind: "member" as const, id: p.id }))

/** The principal's own requests: open ones, and the last month's answers. */
export const mine = Effect.fn("Access.mine")(function*() {
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) => select(sql, { memberId: principal.id }))
})

/** "Toegang vragen": one open request per area; asking again answers the open one. */
export const request = Effect.fn("Access.request")(function*(input: RequestAccess) {
  const principal = yield* CurrentPrincipal
  const role = principal.role
  if (canRole({ ...role, stores: role.stores === "all" ? "all" : [...role.stores] }, input.area, input.level)) {
    return yield* new AlreadyAllowed({ area: input.area, level: input.level })
  }
  const relay = yield* Relay
  const db = yield* Db
  const { requests, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const id = mintId("acr")
      const inserted = yield* sql<{ id: string }>`
        insert into access_requests (id, workspace_id, member_id, role_id, area, level, path)
        values (${id}, ${principal.workspaceId}, ${principal.id}, ${role.id}, ${input.area}, ${input.level},
                ${input.path ?? null})
        on conflict (workspace_id, member_id, area) where state = 'open' do nothing
        returning id`
      const queued: Array<string> = []
      if (inserted.length > 0) {
        yield* Audit.write(sql, principal.workspaceId, yield* actor, {
          action: "access.requested",
          subjectType: "access_request",
          subjectId: id,
          diff: { area: input.area, level: input.level, role: role.id }
        })
        queued.push(
          yield* Outbox.write(sql, principal.workspaceId, {
            type: "access.requested",
            workspaceId: principal.workspaceId,
            requestId: id,
            memberId: principal.id
          })
        )
      }
      return { requests: yield* select(sql, { memberId: principal.id }), outboxIds: queued }
    })
  )
  yield* relay.kick(outboxIds)
  return requests
})

/** The undo of asking: the member's own open request, withdrawn. */
export const withdraw = Effect.fn("Access.withdraw")(function*(id: string) {
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const gone = yield* sql<{ id: string }>`
        update access_requests set state = 'withdrawn', decided_at = now(), decided_by = ${principal.id}
        where id = ${id} and member_id = ${principal.id} and state = 'open' returning id`
      if (gone.length > 0) {
        yield* Audit.write(sql, principal.workspaceId, yield* actor, {
          action: "access.withdrawn",
          subjectType: "access_request",
          subjectId: id
        })
      }
      return yield* select(sql, { memberId: principal.id })
    })
  )
})

/** Rollen's list: open requests first, then the last month's answers. */
export const list = Effect.fn("Access.list")(function*() {
  yield* Policy.require("team", 3)
  const db = yield* Db
  return yield* db.scoped((sql) => select(sql, {}))
})

const decide = (state: "granted" | "declined") =>
  Effect.fn(`Access.${state === "granted" ? "grant" : "decline"}`)(function*(id: string) {
    yield* Policy.require("team", 3)
    const principal = yield* CurrentPrincipal
    const relay = yield* Relay
    const db = yield* Db
    const { requests, outboxIds } = yield* db.scoped((sql) =>
      Effect.gen(function*() {
        const [open] = yield* sql<{ roleId: string; area: AreaId; level: Level; memberId: string }>`
          select role_id, area, level, member_id from access_requests
          where id = ${id} and state = 'open' for update`
        if (open === undefined) return yield* new NotFound({ entity: "access_request", id })
        if (state === "granted") {
          if (open.roleId === "owner") return yield* new Conflict({ entity: "role", reason: "owner" })
          const [role] = yield* sql<{ levels: Record<string, Level> }>`
            select levels from roles where id = ${open.roleId} for update`
          if (role === undefined) return yield* new NotFound({ entity: "role", id: open.roleId })
          const next = clampLevel(open.area, Math.max(role.levels[open.area] ?? 0, open.level) as Level)
          yield* sql`update roles set levels = jsonb_set(levels, array[${open.area}]::text[], to_jsonb(${next}::int)),
                       version = version + 1
                     where id = ${open.roleId}`
        }
        yield* sql`update access_requests set state = ${state}, decided_by = ${principal.id}, decided_at = now()
                   where id = ${id}`
        yield* Audit.write(sql, principal.workspaceId, yield* actor, {
          action: `access.${state}`,
          subjectType: "access_request",
          subjectId: id,
          diff: { area: open.area, level: open.level, role: open.roleId }
        })
        const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
          type: "access.decided",
          workspaceId: principal.workspaceId,
          requestId: id,
          memberId: open.memberId,
          state
        })
        return { requests: yield* select(sql, {}), outboxIds: [outboxId] }
      })
    )
    yield* relay.kick(outboxIds)
    return requests
  })

export const grant = decide("granted")
export const decline = decide("declined")
