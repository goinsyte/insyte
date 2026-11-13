import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { INVITATION_DAYS, InvitationLinks, UNDO_SECONDS } from "../domain/Ports.ts"
import { SupplierAccess, type SupplierInviteRow } from "../domain/Team.ts"
import { cancelMail, EMAIL, mailLater } from "./invite.ts"

/*
 * `Invitations.sendSupplier` (M16 step 2; `kind = 'supplier_portal'`): a supplier's person, invited to its portal for this
 * brand. As a team invitation, mailed once the undo window has passed, but it takes no seat and grants no role: who
 * accepts becomes the supplier's contact (`supplier_contacts`), with the parts of the portal the brand opened. Whoever
 * may change suppliers (Beheren) invites.
 */

export const sendSupplier = Effect.fn("Invitations.sendSupplier")(function*(rows: ReadonlyArray<SupplierInviteRow>) {
  yield* Policy.require("suppliers", 3)
  const principal = yield* CurrentPrincipal
  const links = yield* InvitationLinks
  const relay = yield* Relay
  const db = yield* Db

  const { ids, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const suppliers = new Set(
        (yield* sql<{ id: string }>`select id from suppliers where deleted_at is null`).map((r) => r.id)
      )
      const contacts = new Set(
        (yield* sql<{ key: string }>`
          select c.supplier_id || ' ' || lower(u.email) as key
          from supplier_contacts c join auth."user" u on u.id = c.user_id where c.revoked_at is null`)
          .map((r) => r.key)
      )
      const open = new Map(
        (yield* sql<{ id: string; key: string; round: number; lapsed: boolean }>`
          select id, supplier_id || ' ' || email as key, round, expires_at <= now() as lapsed from invitations
          where kind = 'supplier_portal' and accepted_at is null and revoked_at is null and declined_at is null`)
          .map((r) => [r.key, r])
      )

      const fields: Record<string, string> = {}
      const seen = new Set<string>()
      const wanted = rows.map((row, at) => {
        const email = row.email.trim().toLowerCase()
        const key = `${row.supplierId} ${email}`
        if (!suppliers.has(row.supplierId)) fields[`rows.${at}.supplierId`] = "unknown"
        if (!EMAIL.test(email)) fields[`rows.${at}.email`] = "format"
        else if (seen.has(key)) fields[`rows.${at}.email`] = "duplicate"
        else if (contacts.has(key)) fields[`rows.${at}.email`] = "contact"
        else if (open.get(key)?.lapsed === false) fields[`rows.${at}.email`] = "invited"
        seen.add(key)
        const scopes = [...new Set(["orders", ...row.scopes])]
        return { ...row, email, key, scopes, name: row.name?.trim() || null, message: row.message?.trim() || null }
      })
      if (Object.keys(fields).length > 0) return yield* new Invalid({ fields })

      const queued: Array<string> = []
      const sent: Array<string> = []
      for (const row of wanted) {
        const lapsed = open.get(row.key)
        const id = lapsed?.id ?? mintId("inv")
        const round = lapsed === undefined ? 0 : lapsed.round + 1
        const { tokenHash } = yield* links.invitation(id, round)
        if (lapsed === undefined) {
          yield* sql`insert into invitations
                       (id, workspace_id, kind, email, name, token_hash, round, supplier_id, portal_scopes, message,
                        invited_by, expires_at)
                     values (${id}, ${principal.workspaceId}, 'supplier_portal', ${row.email}, ${row.name},
                             decode(${tokenHash}, 'hex'), 0, ${row.supplierId}, ${row.scopes}::text[], ${row.message},
                             ${principal.id}, now() + make_interval(days => ${INVITATION_DAYS}))`
        } else {
          yield* sql`update invitations set token_hash = decode(${tokenHash}, 'hex'), round = ${round},
                       name = ${row.name}, portal_scopes = ${row.scopes}::text[], message = ${row.message},
                       invited_by = ${principal.id}, sent_at = now(), previous = null,
                       expires_at = now() + make_interval(days => ${INVITATION_DAYS})
                     where id = ${id}`
        }
        yield* Audit.write(sql, principal.workspaceId, { kind: "member", id: principal.id }, {
          action: "supplier.contact_invited",
          subjectType: "supplier",
          subjectId: row.supplierId,
          diff: { invitation: id, scopes: row.scopes }
        })
        queued.push(yield* mailLater(sql, id, round))
        sent.push(id)
      }
      return { ids: sent, outboxIds: queued }
    })
  )
  yield* relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS })
  return { ids }
})

/*
 * Taking it back (M16; the brand's side, suppliers at Beheren): an invitation revoked before it is accepted (the send's
 * own undo, inside the window, so its mail never goes), a contact's access revoked (every portal call holds the contact
 * anew, so the next one is refused, and its open tabs are closed), and the undo of each.
 */

const audit = (sql: SqlClient.SqlClient, action: string, subjectId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: "member", id: p.id }, {
        action,
        subjectType: "supplier",
        subjectId,
        diff
      })
  )

/** Who signs in to one supplier's portal, and who is invited and has not yet. */
export const supplierAccess = Effect.fn("Invitations.supplierAccess")(function*(supplierId: string) {
  yield* Policy.require("suppliers", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const contacts = yield* sql<{
        id: string
        name: string
        email: string
        role: "owner" | "staff"
        scopes: ReadonlyArray<string>
        joinedAt: Date | null
      }>`
        select c.id, c.name, lower(u.email) as email, c.role, c.portal_scopes as scopes, c.joined_at
        from supplier_contacts c join auth."user" u on u.id = c.user_id
        where c.supplier_id = ${supplierId} and c.revoked_at is null
        order by c.joined_at nulls last, c.id`
      const invitations = yield* sql<{
        id: string
        email: string
        name: string | null
        scopes: ReadonlyArray<string>
        sentAt: Date
        lapsed: boolean
      }>`
        select id, email, name, portal_scopes as scopes, sent_at, expires_at <= now() as lapsed from invitations
        where kind = 'supplier_portal' and supplier_id = ${supplierId}
          and accepted_at is null and revoked_at is null and declined_at is null
        order by sent_at desc, id`
      return new SupplierAccess({
        contacts: contacts.map((c) => ({ ...c, joinedAt: c.joinedAt?.getTime() ?? null })),
        invitations: invitations.map((i) => ({ ...i, sentAt: i.sentAt.getTime() }))
      })
    })
  )
})

/** The links stop working at once and mail still waiting is cancelled. */
export const revokeSupplier = Effect.fn("Invitations.revokeSupplier")(function*(ids: ReadonlyArray<string>) {
  yield* Policy.require("suppliers", 3)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const revoked = ids.length === 0 ? [] : yield* sql<{ id: string; supplierId: string }>`
        update invitations set revoked_at = now(), revoked_by = ${principal.id}
        where id in ${sql.in([...ids])} and kind = 'supplier_portal'
          and accepted_at is null and revoked_at is null and declined_at is null
        returning id, supplier_id`
      if (revoked.length > 0) yield* cancelMail(sql, revoked.map((r) => r.id))
      for (const r of revoked) yield* audit(sql, "supplier.invitation_revoked", r.supplierId, { invitation: r.id })
      return { ids: revoked.map((r) => r.id) }
    })
  )
})

/** Undo of a revoke: the same invitation and link, if no newer one went to the address; a cancelled mail goes after all. */
export const restoreSupplier = Effect.fn("Invitations.restoreSupplier")(function*(id: string) {
  yield* Policy.require("suppliers", 3)
  const relay = yield* Relay
  const db = yield* Db
  const { outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const restored = yield* sql<{ supplierId: string }>`
        update invitations set revoked_at = null, revoked_by = null
        where id = ${id} and kind = 'supplier_portal' and revoked_at is not null and accepted_at is null
          and declined_at is null
          and exists (select 1 from suppliers s where s.id = invitations.supplier_id and s.deleted_at is null)
        returning supplier_id`.pipe(
        Effect.catchIf(
          (error: SqlError.SqlError) => error.reason._tag === "UniqueViolation",
          () => Effect.fail(new Conflict({ entity: "invitation", reason: "newer_invitation" }))
        )
      )
      const [row] = restored
      if (row === undefined) return yield* new NotFound({ entity: "invitation", id })
      const revived = (yield* sql<{ id: string }>`
        update outbox set cancelled_at = null, not_before = now()
        where event = 'member.invited' and payload ->> 'invitationId' = ${id}
          and relayed_at is null and cancelled_at is not null
          and (payload ->> 'round')::int = (select round from invitations where id = ${id})
        returning id`).map((r) => r.id)
      yield* audit(sql, "supplier.invitation_restored", row.supplierId, { invitation: id })
      return { outboxIds: revived }
    })
  )
  yield* relay.kick(outboxIds)
  return { ids: [id] }
})

/**
 * A contact's access taken away: `revoked_at` set, so the portal's next call (which holds the contact anew) is refused,
 * and `supplier.contact_revoked` closes its open portal tabs.
 */
export const revokeContact = Effect.fn("Invitations.revokeContact")(function*(id: string) {
  yield* Policy.require("suppliers", 3)
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const outboxId = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ supplierId: string }>`
        update supplier_contacts set revoked_at = now() where id = ${id} and revoked_at is null returning supplier_id`
      if (row === undefined) return yield* new NotFound({ entity: "supplier_contact", id })
      yield* audit(sql, "supplier.contact_revoked", row.supplierId, { contact: id })
      return yield* Outbox.write(sql, principal.workspaceId, {
        type: "supplier.contact_revoked",
        workspaceId: principal.workspaceId,
        supplierId: row.supplierId,
        contactId: id
      })
    })
  )
  yield* relay.kick([outboxId])
  return { ids: [id] }
})

/** Undo of a contact's revoke: back as it was, unless the supplier has another owner by now. */
export const restoreContact = Effect.fn("Invitations.restoreContact")(function*(id: string) {
  yield* Policy.require("suppliers", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ supplierId: string }>`
        update supplier_contacts set revoked_at = null
        where id = ${id} and revoked_at is not null
          and exists (select 1 from suppliers s where s.id = supplier_contacts.supplier_id and s.deleted_at is null)
        returning supplier_id`.pipe(
        Effect.catchIf(
          (error: SqlError.SqlError) => error.reason._tag === "UniqueViolation",
          () => Effect.fail(new Conflict({ entity: "supplier_contact", reason: "owner_taken" }))
        )
      )
      if (row === undefined) return yield* new NotFound({ entity: "supplier_contact", id })
      yield* audit(sql, "supplier.contact_restored", row.supplierId, { contact: id })
      return { ids: [id] }
    })
  )
})
