import { Db } from "@insyte/database/Db"
import { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { readTeam } from "./team.ts"

/*
 * "Eigendom overdragen" (M3.1; widgets/05 §3): the owner hands the workspace to an active member, and becomes
 * Beheerder. Irreversible (M3's undo table): the console asks first, and there is no undo, since only the new owner
 * could undo it. One transaction swaps the two roles; the one-owner trigger (0009, deferred) checks the workspace at
 * commit, so it never has two owners or none. The new owner reaches every store (an owner is held to none), and their
 * next request reads the owner's role (`MemberLive` reads the principal per call). Billing follows the role, not the
 * person: the Stripe customer carries the workspace's billing address, not the owner's.
 */

/** The role a former owner holds after the transfer: the design's "Jij wordt Beheerder". */
export const FORMER_OWNER_ROLE = "admin"

export const transferOwnership = Effect.fn("Members.transferOwnership")(function*(id: string) {
  const principal = yield* CurrentPrincipal
  if (principal.kind !== "member" || principal.role.id !== "owner") {
    return yield* new Forbidden({ permission: "owner", level: 0, roleLabel: principal.role.label })
  }
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      if (id === principal.id) return yield* new Conflict({ entity: "member", reason: "self" })
      const [target] = yield* sql<{ roleId: string; deactivated: boolean; removed: boolean }>`
        select role_id, deactivated_at is not null as deactivated, removed_at is not null as removed
        from members where id = ${id} for update`
      if (target === undefined || target.removed) return yield* new NotFound({ entity: "member", id })
      if (target.deactivated) return yield* new Conflict({ entity: "member", reason: "deactivated" })
      yield* sql`update members set role_id = ${FORMER_OWNER_ROLE} where id = ${principal.id} and role_id = 'owner'`
      yield* sql`update members set role_id = 'owner', stores = '"all"'::jsonb where id = ${id}`
      yield* Audit.write(sql, principal.workspaceId, { kind: "member", id: principal.id }, {
        action: "workspace.ownership_transferred",
        subjectType: "member",
        subjectId: id,
        diff: { owner: [principal.id, id], role: [target.roleId, "owner"], formerOwnerRole: FORMER_OWNER_ROLE }
      })
      return yield* readTeam(sql)
    })
  )
})
