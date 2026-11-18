import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { OutboxEvent } from "../../shared/domain/Outbox.ts"
import { refreshPayouts } from "./close.ts"
import { attribute, settle } from "./conversions.ts"

/*
 * The programme's sink (M16 steps 4–5), as the relay, the system in the workspace: an order Shopify told of becomes a
 * conversion; one fulfilled or cancelled is followed in its window; a decision and a payout, once their undo window
 * has passed, are told to the affiliate in its portal (`recipient_kind = 'affiliate'`), and a payout's ledger line is
 * written then. Nothing here reaches outside Insyte: no money moves.
 */

type Of<T extends OutboxEvent["type"]> = Extract<OutboxEvent, { type: T }>

/** One note in an affiliate's portal: `partner.work` (its standing) or `partner.money` (its payouts). */
const note = (
  sql: SqlClient.SqlClient,
  affiliateId: string,
  kind: "partner.work" | "partner.money",
  subject: { readonly type: string; readonly id: string },
  data: Record<string, unknown>
) =>
  sql`insert into notifications (id, workspace_id, recipient_kind, recipient_id, kind, subject_type, subject_id,
                                 actor_kind, actor_id, data)
      values (${mintId("ntf")}, app_workspace_id(), 'affiliate', ${affiliateId}, ${kind}, ${subject.type},
              ${subject.id}, null, null, ${JSON.stringify(data)}::jsonb)`

export const ordersPlaced = Effect.fn("Affiliates.ordersPlaced")(function*(
  sql: SqlClient.SqlClient,
  event: Of<"order.placed">
) {
  const made = yield* attribute(sql, event.orderIds)
  if (made.length === 0) return
  const rows = yield* sql<{ affiliateId: string; id: string; number: string; commission: number; currency: string }>`
    select affiliate_id, id, order_number as number, commission_minor as commission, currency
    from affiliate_conversions where id in ${sql.in(made)}`
  for (const r of rows) {
    yield* note(sql, r.affiliateId, "partner.money", { type: "affiliate_conversion", id: r.id }, {
      type: "conversion",
      order: r.number,
      commissionMinor: Number(r.commission),
      currency: r.currency
    })
  }
})

export const ordersChanged = Effect.fn("Affiliates.ordersChanged")(function*(
  sql: SqlClient.SqlClient,
  event: Of<"order.fulfilled"> | Of<"order.cancelled">
) {
  const changed = yield* settle(sql, { orderIds: event.orderIds })
  if (changed.length > 0) yield* refreshPayouts(sql)
})

export const decided = Effect.fn("Affiliates.decided")(function*(
  sql: SqlClient.SqlClient,
  event: Of<"affiliate.decided">
) {
  if (event.decision !== "approved" || event.affiliateId === null) return
  const [a] = yield* sql<{ code: string; tier: string }>`
    select code, tier from affiliates where id = ${event.affiliateId}`
  if (a === undefined) return
  yield* note(sql, event.affiliateId, "partner.work", { type: "affiliate", id: event.affiliateId }, {
    type: "approved",
    code: a.code,
    tier: a.tier
  })
})

/**
 * A payout approved: its `approval` line (zero, the marker), and the affiliate hears it. Marked paid: its `settlement`
 * line (what was paid, taken off what is owed), and the affiliate hears it. Once per payout and step, however often
 * the event comes.
 */
export const payout = Effect.fn("Affiliates.payout")(
  function*(sql: SqlClient.SqlClient, event: Of<"affiliate.payout">) {
    const kind = event.step === "approved" ? "approval" : "settlement"
    const rows = yield* sql<{ id: string; affiliateId: string; month: string; amount: number; currency: string }>`
    select p.id, p.affiliate_id, p.month, coalesce(p.paid_minor, p.approvable_minor) as amount, p.currency
    from affiliate_payouts p
    where p.id in ${sql.in([...event.payoutIds, ""])}
      and p.status = ${event.step === "approved" ? "approved" : "paid"}`
    for (const p of rows) {
      // One line per payout and kind (a unique index): the event delivered twice writes and tells it once.
      const written = yield* sql`
        insert into affiliate_ledger_entries (id, workspace_id, affiliate_id, payout_id, kind, amount_minor, currency,
                                              month, actor)
        values (${mintId("ale")}, app_workspace_id(), ${p.affiliateId}, ${p.id}, ${kind},
                ${kind === "approval" ? 0 : -Number(p.amount)}, ${p.currency}, ${p.month}, ${event.userId})
        on conflict (payout_id, kind) where payout_id is not null do nothing
        returning id`
      if (written.length === 0) continue
      yield* note(sql, p.affiliateId, "partner.money", { type: "affiliate_payout", id: p.id }, {
        type: event.step === "approved" ? "payout_approved" : "payout_paid",
        month: p.month,
        amountMinor: Number(p.amount),
        currency: p.currency
      })
    }
  }
)
