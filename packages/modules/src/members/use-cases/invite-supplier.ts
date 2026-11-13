import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { INVITATION_DAYS, InvitationLinks, UNDO_SECONDS } from "../domain/Ports.ts"
import type { SupplierInviteRow } from "../domain/Team.ts"
import { EMAIL, mailLater } from "./invite.ts"

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
