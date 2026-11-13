import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { SeatLimitReached } from "../domain/Team.ts"
import { beyondReach, grantable } from "./invite.ts"
import { readTeam, seatsIn } from "./team.ts"

/*
 * What the member table does with a person (M3.3), each with its undo: the role, deactivate ↔ reactivate, remove ↔
 * restore. Managing the team is `team` at Beheren. Nobody changes the owner here (that is a transfer, with its own
 * confirmation) or deactivates or removes themselves.
 */

/** The member, locked for the change, if it may be changed by this principal. */
const target = (sql: SqlClient.SqlClient, id: string) =>
  Effect.gen(function*() {
    const principal = yield* CurrentPrincipal
    const [row] = yield* sql<
      { roleId: string; stores: "all" | ReadonlyArray<string>; deactivated: boolean; removed: boolean }
    >`
      select role_id, stores, deactivated_at is not null as deactivated, removed_at is not null as removed
      from members where id = ${id} for update`
    if (row === undefined) return yield* new NotFound({ entity: "member", id })
    if (row.roleId === "owner") return yield* new Conflict({ entity: "member", reason: "owner" })
    if (id === principal.id) return yield* new Conflict({ entity: "member", reason: "self" })
    return row
  })

const audit = (sql: SqlClient.SqlClient, action: string, subjectId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: "member", id: p.id }, { action, subjectType: "member", subjectId, diff })
  )

export const setRole = Effect.fn("Members.setRole")(function*(id: string, roleId: string) {
  yield* Policy.require("team", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      if (!(yield* grantable(sql)).has(roleId)) return yield* new Invalid({ fields: { roleId: "unknown" } })
      const before = yield* target(sql, id)
      if (yield* beyondReach(sql, roleId, before.stores)) return yield* new Invalid({ fields: { stores: "forbidden" } })
      yield* sql`update members set role_id = ${roleId} where id = ${id}`
      yield* audit(sql, "member.role_changed", id, { role: [before.roleId, roleId] })
      return yield* readTeam(sql)
    })
  )
})

/** Deactivated: frees the seat, cannot sign in to this workspace, keeps everything they wrote. */
export const setDeactivated = Effect.fn("Members.setDeactivated")(function*(id: string, deactivated: boolean) {
  yield* Policy.require("team", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* target(sql, id)
      if (before.deactivated === deactivated) return yield* readTeam(sql)
      if (!deactivated) {
        const seats = yield* seatsIn(sql)
        if (seats.free < 1) return yield* new SeatLimitReached({ total: seats.total, free: 0 })
      }
      yield* sql`update members set deactivated_at = ${deactivated ? sql`now()` : null} where id = ${id}`
      yield* audit(sql, deactivated ? "member.deactivated" : "member.reactivated", id)
      return yield* readTeam(sql)
    })
  )
})

/** Removed: out of the team and its seat; the row stays for authorship and for the undo. */
export const remove = Effect.fn("Members.remove")(function*(id: string) {
  yield* Policy.require("team", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* target(sql, id)
      if (!before.removed) {
        yield* sql`update members set removed_at = now() where id = ${id}`
        yield* audit(sql, "member.removed", id)
      }
      return yield* readTeam(sql)
    })
  )
})

/** Undo of a remove: back in the team as they were, if a seat is free. */
export const restore = Effect.fn("Members.restore")(function*(id: string) {
  yield* Policy.require("team", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = yield* target(sql, id)
      if (before.removed) {
        const seats = yield* seatsIn(sql)
        if (!before.deactivated && seats.free < 1) {
          return yield* new SeatLimitReached({ total: seats.total, free: 0 })
        }
        yield* sql`update members set removed_at = null where id = ${id}`
        yield* audit(sql, "member.restored", id)
      }
      return yield* readTeam(sql)
    })
  )
})
