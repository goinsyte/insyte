import { Db } from "@insyte/database/Db"
import { Conflict, Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { InvitationLinks } from "../domain/Ports.ts"
import type { SetLink } from "../domain/Team.ts"
import { beyondReach, grantable } from "./invite.ts"
import { readTeam } from "./team.ts"

/*
 * The shareable link (M3.4): one per workspace, off until someone turns it on, granting one role and lapsing a set
 * number of days after it was made. "Nieuwe link" starts the next round, so the old address stops working; its undo
 * puts the previous round back. People who join through it still take a seat (checked when they join).
 */

const audit = (sql: SqlClient.SqlClient, action: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: "member", id: p.id }, {
        action,
        subjectType: "invite_link",
        subjectId: p.workspaceId,
        diff
      })
  )

/** The workspace's link row, made on first use: off, as Alleen lezen, for 7 days. */
const ensure = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const principal = yield* CurrentPrincipal
    const { tokenHash } = yield* (yield* InvitationLinks).shareable(principal.workspaceId, 0)
    yield* sql`insert into invite_links (workspace_id, token_hash, role_id, days, expires_at)
               values (${principal.workspaceId}, decode(${tokenHash}, 'hex'), 'view', 7, now() + interval '7 days')
               on conflict (workspace_id) do nothing`
  })

export const set = Effect.fn("InviteLink.set")(function*(patch: SetLink) {
  yield* Policy.require("team", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      if (patch.roleId !== undefined && !(yield* grantable(sql)).has(patch.roleId)) {
        return yield* new Invalid({ fields: { roleId: "unknown" } })
      }
      yield* ensure(sql)
      // Whoever joins through the link gets its role in every store: someone held to some stores cannot open it.
      const [now] = yield* sql<{ enabled: boolean; roleId: string }>`select enabled, role_id from invite_links`
      if ((patch.enabled ?? now!.enabled) && (yield* beyondReach(sql, patch.roleId ?? now!.roleId, "all"))) {
        return yield* new Invalid({ fields: { roleId: "forbidden" } })
      }
      yield* sql`update invite_links set
                   enabled = coalesce(${patch.enabled ?? null}, enabled),
                   role_id = coalesce(${patch.roleId ?? null}, role_id),
                   days = coalesce(${patch.days ?? null}, days),
                   expires_at = created_at + make_interval(days => coalesce(${patch.days ?? null}, days))`
      yield* audit(sql, "member.invite_link_changed", { ...patch })
      return yield* readTeam(sql)
    })
  )
})

/** A new address, on, for the link's days from now; nobody has joined through it yet. */
export const regenerate = Effect.fn("InviteLink.regenerate")(function*() {
  yield* Policy.require("team", 2)
  const principal = yield* CurrentPrincipal
  const links = yield* InvitationLinks
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* ensure(sql)
      const [row] = yield* sql<{ round: number; roleId: string }>`select round, role_id from invite_links for update`
      if (yield* beyondReach(sql, row?.roleId ?? "view", "all")) {
        return yield* new Invalid({ fields: { roleId: "forbidden" } })
      }
      const round = (row?.round ?? 0) + 1
      const { tokenHash } = yield* links.shareable(principal.workspaceId, round)
      yield* sql`update invite_links set
                   previous = jsonb_build_object('round', round, 'token_hash', encode(token_hash, 'hex'),
                                                 'enabled', enabled, 'created_at', created_at,
                                                 'expires_at', expires_at, 'joined_count', joined_count),
                   round = ${round}, token_hash = decode(${tokenHash}, 'hex'), enabled = true,
                   created_at = now(), expires_at = now() + make_interval(days => days), joined_count = 0`
      yield* audit(sql, "member.invite_link_regenerated", { round })
      return yield* readTeam(sql)
    })
  )
})

/** Undo of "Nieuwe link": the previous address works again, as it was. */
export const undoRegenerate = Effect.fn("InviteLink.undoRegenerate")(function*() {
  yield* Policy.require("team", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const undone = yield* sql<{ round: number }>`
        update invite_links set
          round = (previous ->> 'round')::int, token_hash = decode(previous ->> 'token_hash', 'hex'),
          enabled = (previous ->> 'enabled')::boolean, created_at = (previous ->> 'created_at')::timestamptz,
          expires_at = (previous ->> 'expires_at')::timestamptz,
          joined_count = joined_count + (previous ->> 'joined_count')::int, previous = null
        where previous is not null
        returning round`
      if (undone.length === 0) return yield* new Conflict({ entity: "invite_link", reason: "nothing_to_undo" })
      yield* audit(sql, "member.invite_link_regenerate_undone")
      return yield* readTeam(sql)
    })
  )
})
