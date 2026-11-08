import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { INVITATION_DAYS, InvitationLinks, UNDO_SECONDS } from "../domain/Ports.ts"
import { SeatLimitReached } from "../domain/Team.ts"
import { cancelMail, grantable, mailLater } from "./invite.ts"
import { readTeam, seatsIn } from "./team.ts"

/*
 * What the pending list does with an invitation (M3.4), each with the undo the console offers: revoke ↔ restore (a send's
 * undo is a revoke inside the window, so its mail never goes), resend ↔ `undoResend`, and the role it grants. Each
 * answers the team page.
 */

const audit = (sql: SqlClient.SqlClient, action: string, subjectId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: "member", id: p.id }, {
        action,
        subjectType: "invitation",
        subjectId,
        diff
      })
  )

const OPEN = (sql: SqlClient.SqlClient) =>
  sql`kind = 'team' and accepted_at is null and revoked_at is null and declined_at is null`

/** The revoked links stop working at once, the seats free up, and mail still waiting is cancelled. */
export const revoke = Effect.fn("Invitations.revoke")(function*(ids: ReadonlyArray<string>) {
  yield* Policy.require("team", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const revoked = yield* sql<{ id: string }>`
        update invitations set revoked_at = now(), revoked_by = ${principal.id}
        where id in ${sql.in([...ids])} and ${OPEN(sql)} returning id`
      if (revoked.length > 0) yield* cancelMail(sql, revoked.map((r) => r.id))
      for (const { id } of revoked) yield* audit(sql, "member.invitation_revoked", id)
      return yield* readTeam(sql)
    })
  )
})

/** Undo of a revoke: the same invitation and link, if no newer one went to the address and a seat is free. */
export const restore = Effect.fn("Invitations.restore")(function*(id: string) {
  yield* Policy.require("team", 2)
  const relay = yield* Relay
  const db = yield* Db
  const { team, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const seats = yield* seatsIn(sql)
      if (seats.free < 1) return yield* new SeatLimitReached({ total: seats.total, free: 0 })
      const restored = yield* sql<{ id: string }>`
        update invitations set revoked_at = null, revoked_by = null
        where id = ${id} and kind = 'team' and revoked_at is not null and accepted_at is null and declined_at is null
        returning id`.pipe(
        Effect.catchIf(
          (error: SqlError.SqlError) => error.reason._tag === "UniqueViolation",
          () => Effect.fail(new Conflict({ entity: "invitation", reason: "newer_invitation" }))
        )
      )
      if (restored.length === 0) return yield* new NotFound({ entity: "invitation", id })
      // A mail the revoke cancelled before it went goes after all.
      const revived = (yield* sql<{ id: string }>`
        update outbox set cancelled_at = null, not_before = now()
        where event = 'member.invited' and payload ->> 'invitationId' = ${id}
          and relayed_at is null and cancelled_at is not null
          and (payload ->> 'round')::int = (select round from invitations where id = ${id})
        returning id`).map((r) => r.id)
      yield* audit(sql, "member.invitation_restored", id)
      return { team: yield* readTeam(sql), outboxIds: revived }
    })
  )
  yield* relay.kick(outboxIds)
  return team
})

/** A new link in the next round, valid for another week; the previous link stops working. */
export const resend = Effect.fn("Invitations.resend")(function*(id: string) {
  yield* Policy.require("team", 2)
  const links = yield* InvitationLinks
  const relay = yield* Relay
  const db = yield* Db
  const { team, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ round: number }>`
        select round from invitations where id = ${id} and ${OPEN(sql)} for update`
      if (row === undefined) return yield* new NotFound({ entity: "invitation", id })
      const round = row.round + 1
      const { tokenHash } = yield* links.invitation(id, round)
      yield* cancelMail(sql, [id])
      yield* sql`update invitations set
                   previous = jsonb_build_object('round', round, 'token_hash', encode(token_hash, 'hex'),
                                                 'sent_at', sent_at, 'expires_at', expires_at),
                   round = ${round}, token_hash = decode(${tokenHash}, 'hex'), sent_at = now(),
                   expires_at = now() + make_interval(days => ${INVITATION_DAYS})
                 where id = ${id}`
      yield* audit(sql, "member.invitation_resent", id, { round })
      const outboxId = yield* mailLater(sql, id, round)
      return { team: yield* readTeam(sql), outboxIds: [outboxId] }
    })
  )
  yield* relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS })
  return team
})

/** Undo of a resend, inside its window: the previous link and expiry again, and the new mail never goes. */
export const undoResend = Effect.fn("Invitations.undoResend")(function*(id: string) {
  yield* Policy.require("team", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const undone = yield* sql<{ id: string }>`
        update invitations set
          round = (previous ->> 'round')::int, token_hash = decode(previous ->> 'token_hash', 'hex'),
          sent_at = (previous ->> 'sent_at')::timestamptz, expires_at = (previous ->> 'expires_at')::timestamptz,
          previous = null
        where id = ${id} and previous is not null and ${OPEN(sql)}
          and exists (select 1 from outbox where event = 'member.invited' and payload ->> 'invitationId' = ${id}
                        and relayed_at is null and cancelled_at is null)
        returning id`
      if (undone.length === 0) return yield* new Conflict({ entity: "invitation", reason: "already_sent" })
      yield* cancelMail(sql, [id])
      yield* audit(sql, "member.invitation_resend_undone", id)
      return yield* readTeam(sql)
    })
  )
})

/** The role the invitation will grant. */
export const setRole = Effect.fn("Invitations.setRole")(function*(id: string, roleId: string) {
  yield* Policy.require("team", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      if (!(yield* grantable(sql)).has(roleId)) return yield* new Invalid({ fields: { roleId: "unknown" } })
      const [before] = yield* sql<{ roleId: string }>`
        select role_id from invitations where id = ${id} and ${OPEN(sql)} for update`
      if (before === undefined) return yield* new NotFound({ entity: "invitation", id })
      yield* sql`update invitations set role_id = ${roleId} where id = ${id}`
      yield* audit(sql, "member.invitation_role_changed", id, { role: [before.roleId, roleId] })
      return yield* readTeam(sql)
    })
  )
})
