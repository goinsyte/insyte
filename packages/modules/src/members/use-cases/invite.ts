import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { narrowStores, type StoreAccess, withinScope } from "../../shared/domain/Stores.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { INVITATION_DAYS, InvitationLinks, UNDO_SECONDS } from "../domain/Ports.ts"
import { type InviteRow, SeatLimitReached } from "../domain/Team.ts"
import { readTeam, seatsIn } from "./team.ts"

/*
 * `Invitations.send` (M3.4): one invitation per address, each taking a seat, each mailed once the undo window has
 * passed (its outbox row waits `UNDO_SECONDS`), so the console's "Ongedaan maken" revokes it before anyone is mailed.
 * An address with a lapsed invitation gets that one renewed, in its next round, so its old link stops working.
 */

export const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i

/** The roles an invitation may grant: any of the workspace's, but never the owner's (that is a transfer). */
export const grantable = (sql: SqlClient.SqlClient) =>
  Effect.map(sql<{ id: string }>`select id from roles where id <> 'owner'`, (rows) => new Set(rows.map((r) => r.id)))

/**
 * Whether someone at `roleId` with these stores of their own would reach past the principal's stores (`storeScope`).
 * A person held to some stores never brings in, or moves, anyone who reaches further than they do.
 */
export const beyondReach = (sql: SqlClient.SqlClient, roleId: string, stores: StoreAccess) =>
  Effect.gen(function*() {
    const { storeScope } = yield* CurrentPrincipal
    if (storeScope === null) return false
    const [role] = yield* sql<{ stores: StoreAccess }>`select stores from roles where id = ${roleId}`
    return role !== undefined && !withinScope(narrowStores(role.stores, stores), storeScope)
  })

/** Writes `member.invited` for this round, held back by the undo window; answers the outbox id. */
export const mailLater = (sql: SqlClient.SqlClient, invitationId: string, round: number) =>
  Effect.flatMap(Effect.service(CurrentPrincipal), (p) =>
    Outbox.write(sql, p.workspaceId, {
      type: "member.invited",
      workspaceId: p.workspaceId,
      invitationId,
      invitedBy: p.id,
      userId: p.userId ?? p.id,
      round
    }, { afterSeconds: UNDO_SECONDS }))

/** Cancels the invitation's mail that has not gone yet, whatever its round. */
export const cancelMail = (sql: SqlClient.SqlClient, invitationIds: ReadonlyArray<string>) =>
  sql`update outbox set cancelled_at = now()
      where event = 'member.invited' and payload ->> 'invitationId' in ${sql.in([...invitationIds])}
        and relayed_at is null and cancelled_at is null`

export const send = Effect.fn("Invitations.send")(function*(rows: ReadonlyArray<InviteRow>) {
  yield* Policy.require("team", 2)
  const principal = yield* CurrentPrincipal
  const links = yield* InvitationLinks
  const relay = yield* Relay
  const db = yield* Db

  const { team, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const roles = yield* grantable(sql)
      const taken = new Set(
        (yield* sql<{ email: string }>`
          select lower(u.email) as email from members m join auth."user" u on u.id = m.user_id
          where m.removed_at is null`).map((r) => r.email)
      )
      const open = new Map(
        (yield* sql<{ id: string; email: string; round: number; lapsed: boolean }>`
          select id, email, round, expires_at <= now() as lapsed from invitations
          where kind = 'team' and accepted_at is null and revoked_at is null and declined_at is null`)
          .map((r) => [r.email, r])
      )

      // Each row is checked on its own, so the console can say which address and why.
      const fields: Record<string, string> = {}
      const seen = new Set<string>()
      for (const [at, row] of rows.entries()) {
        if (yield* beyondReach(sql, row.roleId, row.stores)) fields[`rows.${at}.stores`] = "forbidden"
      }
      const wanted = rows.map((row, at) => {
        const email = row.email.trim().toLowerCase()
        if (!EMAIL.test(email)) fields[`rows.${at}.email`] = "format"
        else if (seen.has(email)) fields[`rows.${at}.email`] = "duplicate"
        else if (taken.has(email)) fields[`rows.${at}.email`] = "member"
        else if (open.get(email)?.lapsed === false) fields[`rows.${at}.email`] = "invited"
        if (!roles.has(row.roleId)) fields[`rows.${at}.roleId`] = "unknown"
        seen.add(email)
        return { ...row, email, message: row.message?.trim() || null }
      })
      if (Object.keys(fields).length > 0) return yield* new Invalid({ fields })

      const seats = yield* seatsIn(sql)
      if (wanted.length > seats.free) return yield* new SeatLimitReached({ total: seats.total, free: seats.free })

      const queued: Array<string> = []
      for (const row of wanted) {
        const lapsed = open.get(row.email)
        const id = lapsed?.id ?? mintId("inv")
        const round = lapsed === undefined ? 0 : lapsed.round + 1
        const { tokenHash } = yield* links.invitation(id, round)
        const stores = JSON.stringify(row.stores)
        if (lapsed === undefined) {
          yield* sql`insert into invitations
                       (id, workspace_id, email, token_hash, round, role_id, stores, message, invited_by, expires_at)
                     values (${id}, ${principal.workspaceId}, ${row.email}, decode(${tokenHash}, 'hex'), 0,
                             ${row.roleId}, ${stores}::jsonb, ${row.message}, ${principal.id},
                             now() + make_interval(days => ${INVITATION_DAYS}))`
        } else {
          yield* sql`update invitations set token_hash = decode(${tokenHash}, 'hex'), round = ${round},
                       role_id = ${row.roleId}, stores = ${stores}::jsonb, message = ${row.message},
                       invited_by = ${principal.id}, sent_at = now(), previous = null,
                       expires_at = now() + make_interval(days => ${INVITATION_DAYS})
                     where id = ${id}`
        }
        yield* Audit.write(sql, principal.workspaceId, { kind: "member", id: principal.id }, {
          action: "member.invited",
          subjectType: "invitation",
          subjectId: id,
          diff: { role: row.roleId }
        })
        queued.push(yield* mailLater(sql, id, round))
      }
      return { team: yield* readTeam(sql), outboxIds: queued }
    })
  )
  yield* relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS })
  return team
})
