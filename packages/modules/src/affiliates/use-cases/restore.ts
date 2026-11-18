import { Forbidden } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { audit } from "./operator.ts"
import { restorePayouts } from "./payouts.ts"

/*
 * "Ongedaan maken" for the brand's affiliate writes (ADR-0023), run by `Shared.undo` on its own transaction with the
 * snapshot the token holds. What the write sent outside Insyte (the affiliate's note, the Shopify discount, the mail)
 * waited in the outbox and is cancelled by the undo itself. Only the member side redeems these: an affiliate's own
 * undo is its portal's (`PORTAL_RESTORE`).
 */

const Restore = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("affiliate"),
    id: Schema.String,
    tier: Schema.String,
    rate: Schema.Finite,
    status: Schema.String
  }),
  Schema.Struct({ kind: Schema.Literal("approval"), applicationId: Schema.String, affiliateId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("rejection"), applicationId: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("payouts.approved"),
    payoutIds: Schema.Array(Schema.String),
    detached: Schema.Array(Schema.Struct({ id: Schema.String, payoutId: Schema.String }))
  }),
  Schema.Struct({ kind: Schema.Literal("payouts.paid"), payoutIds: Schema.Array(Schema.String) }),
  Schema.Struct({ kind: Schema.Literal("invite"), invitationId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("unrevoke"), invitationId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("resource"), resourceId: Schema.String })
])

export const restore = Effect.fn("Affiliates.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const principal = yield* CurrentPrincipal
  if (principal.kind === "affiliate" || principal.kind === "supplier_contact") {
    return yield* new Forbidden({ permission: "affiliates", level: 2, roleLabel: principal.role.label })
  }
  const undo = yield* Schema.decodeUnknownEffect(Restore)(compensation).pipe(Effect.orDie)
  switch (undo.kind) {
    case "affiliate":
      yield* sql`update affiliates set tier = ${undo.tier}, rate = ${undo.rate}, status = ${undo.status}
                 where id = ${undo.id}`
      return yield* audit(sql, "affiliate.restored", "affiliate", undo.id)
    case "approval":
      // The affiliate made a moment ago goes again, with its code; nothing of it left Insyte.
      yield* sql`update affiliate_applications set status = 'pending', decided_by = null, decided_at = null,
                   affiliate_id = null
                 where id = ${undo.applicationId}`
      yield* sql`delete from affiliates where id = ${undo.affiliateId}
                   and not exists (select 1 from affiliate_conversions c where c.affiliate_id = ${undo.affiliateId})`
      return yield* audit(sql, "affiliate.approval_undone", "affiliate_application", undo.applicationId)
    case "rejection":
      yield* sql`update affiliate_applications set status = 'pending', reason = null, decided_by = null,
                   decided_at = null
                 where id = ${undo.applicationId} and status = 'rejected'`
      return yield* audit(sql, "affiliate.rejection_undone", "affiliate_application", undo.applicationId)
    case "payouts.approved":
    case "payouts.paid":
      return yield* restorePayouts(sql, undo)
    case "invite":
      yield* sql`update invitations set revoked_at = now(), revoked_by = ${principal.id}
                 where id = ${undo.invitationId} and kind = 'affiliate' and accepted_at is null`
      return yield* audit(sql, "affiliate.invite_revoked", "invitation", undo.invitationId)
    case "unrevoke":
      yield* sql`update invitations set revoked_at = null, revoked_by = null
                 where id = ${undo.invitationId} and kind = 'affiliate' and accepted_at is null`
      return yield* audit(sql, "affiliate.invite_restored", "invitation", undo.invitationId)
    case "resource":
      yield* sql`update affiliate_resources set archived_at = null where id = ${undo.resourceId}`
      return yield* audit(sql, "affiliate.resource_restored", "affiliate_resource", undo.resourceId)
  }
})
