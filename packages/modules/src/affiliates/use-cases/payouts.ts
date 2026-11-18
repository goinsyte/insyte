import { Db } from "@insyte/database/Db"
import { Conflict, Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { AffiliatesChange, type PaymentMethod, PayoutLine, PayoutsView } from "../domain/Affiliates.ts"
import type { ApprovePayoutsInput, MarkPaidInput, PayoutsInput } from "../domain/Inputs.ts"
import { refreshPayouts } from "./close.ts"
import { audit, everyStore, RESTORE } from "./operator.ts"
import { currencyOf, ensureProgram, monthOf, payDayOf, previousMonth } from "./program.ts"

/*
 * The brand's monthly payouts (M16 step 5; widgets/06 Part C "Uitbetalingen"). A month has payouts once it was closed
 * (`MonthlyCloseWorkflow` on the 1st); the running month "loopt nog" and shows what is coming. Approving pays the part
 * past its window; what is still in its window rolls into the next close. Marking paid records that the brand paid it
 * outside Insyte. Both have Undo, and the affiliate hears of each once the window has passed. Payouts span the stores:
 * only someone who reaches every store sees or changes them. No money moves.
 */

interface Line {
  readonly affiliateId: string
  readonly name: string
  readonly payoutId: string | null
  readonly orders: number
  readonly approvable: string
  readonly inWindow: string
  readonly reversed: string
  readonly total: string
  readonly method: PaymentMethod | null
  readonly status: "approvable" | "approved" | "paid" | null
}

export const list = Effect.fn("Affiliates.payouts")(function*(input: PayoutsInput) {
  yield* Policy.require("affiliates", 1)
  const { storeScope } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const program = yield* ensureProgram(sql)
      const running = monthOf(new Date())
      const month = input.month ?? previousMonth(running)
      const closed = month < running
      const currency = yield* currencyOf(sql)
      const months = yield* sql<{ month: string }>`
        select distinct month from affiliate_payouts order by month desc limit 24`
      const empty = new PayoutsView({
        month,
        closed,
        payDay: payDayOf(month, program.payoutDay),
        lines: [],
        summary: { toApproveMinor: 0, approvedMinor: 0, inWindowMinor: 0 },
        currency,
        months: [running, ...months.map((m) => m.month).filter((m) => m !== running)]
      })
      if (storeScope !== null) return empty
      const rows = closed
        ? yield* sql<Line>`
            select a.id as affiliate_id, a.name, p.id as payout_id, p.conversions as orders,
                   p.approvable_minor as approvable, p.in_window_minor as in_window, p.reversed_minor as reversed,
                   p.total_minor as total, coalesce(p.method_snapshot, a.payment_method) as method, p.status
            from affiliate_payouts p join affiliates a on a.id = p.affiliate_id
            where p.month = ${month}
            order by a.name, a.id`
        // The running month: what its conversions come to so far, nothing to approve yet.
        : yield* sql<Line>`
            select a.id as affiliate_id, a.name, null as payout_id,
                   count(*) filter (where c.status <> 'reversed')::int as orders,
                   coalesce(sum(c.commission_minor) filter (where c.status = 'approved'), 0) as approvable,
                   coalesce(sum(c.commission_minor) filter (where c.status = 'pending'), 0) as in_window,
                   0 as reversed, coalesce(sum(c.commission_minor), 0) as total, a.payment_method as method,
                   null as status
            from affiliate_conversions c join affiliates a on a.id = c.affiliate_id
            where c.month = ${month} and c.payout_id is null
            group by a.id, a.name, a.payment_method
            order by a.name, a.id`
      const lines = rows.map((r) =>
        new PayoutLine({
          affiliateId: r.affiliateId,
          name: r.name,
          payoutId: r.payoutId,
          orders: r.orders,
          approvableMinor: Number(r.approvable),
          inWindowMinor: Number(r.inWindow),
          reversedMinor: Number(r.reversed),
          totalMinor: Number(r.total),
          method: r.method,
          status: r.status === null
            ? "open"
            : r.status === "approvable" && Number(r.approvable) === 0
            ? "nothing"
            : r.status
        })
      )
      const sum = (f: (l: PayoutLine) => number) => lines.reduce((s, l) => s + f(l), 0)
      return new PayoutsView({
        ...empty,
        lines,
        summary: {
          toApproveMinor: sum((l) => (l.status === "approvable" ? l.approvableMinor : 0)),
          approvedMinor: sum((l) => (l.status === "approved" || l.status === "paid" ? l.approvableMinor : 0)),
          inWindowMinor: sum((l) => l.inWindowMinor)
        }
      })
    })
  )
})

const closedMonth = (month: string) =>
  month < monthOf(new Date())
    ? Effect.void
    : Effect.fail(new Conflict({ entity: "affiliate_payout", reason: "month_open" }))

const kicked = <A, E, R>(
  work: Effect.Effect<{ readonly change: A; readonly outboxIds: ReadonlyArray<string> }, E, R>
) =>
  Effect.flatMap(
    work,
    (r) =>
      Effect.as(
        Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(r.outboxIds, { afterSeconds: UNDO_SECONDS })),
        r.change
      )
  )

/**
 * "Goedkeuren" for a closed month: each payout with something past its window is approved for that part; its
 * conversions still in their window leave it and roll into the next close. The affiliate is told, and the ledger's
 * marker written, once the undo window has passed.
 */
export const approve = Effect.fn("Affiliates.approvePayouts")(function*(input: ApprovePayoutsInput) {
  yield* Policy.require("affiliates", 3)
  yield* everyStore
  yield* closedMonth(input.month)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* kicked(db.scoped((sql) =>
    Effect.gen(function*() {
      const due = yield* sql<{ id: string; affiliateId: string }>`
        select p.id, p.affiliate_id from affiliate_payouts p
        where p.month = ${input.month} and p.affiliate_id in ${sql.in([...input.affiliateIds])}
          and p.status = 'approvable' and p.approvable_minor > 0
        for update`
      if (due.length === 0) return yield* new Conflict({ entity: "affiliate_payout", reason: "nothing_to_approve" })
      const ids = due.map((p) => p.id)
      // Still in their window: out of this payout, into the next close; which payout each left, for the undo.
      const detached = yield* sql<{ id: string; payoutId: string }>`
        with d as (select id, payout_id from affiliate_conversions
                   where payout_id in ${sql.in(ids)} and status = 'pending' for update)
        update affiliate_conversions c set payout_id = null from d where c.id = d.id
        returning c.id, d.payout_id`
      yield* sql`update affiliate_payouts p set status = 'approved', approved_by = ${principal.id}, approved_at = now(),
                   method_snapshot = a.payment_method, in_window_minor = 0, total_minor = p.approvable_minor
                 from affiliates a where a.id = p.affiliate_id and p.id in ${sql.in(ids)}`
      for (const p of due) {
        yield* audit(sql, "affiliate.payout_approved", "affiliate_payout", p.id, { month: input.month })
      }
      const told = yield* Outbox.write(sql, principal.workspaceId, {
        type: "affiliate.payout",
        workspaceId: principal.workspaceId,
        step: "approved",
        payoutIds: ids,
        userId: principal.userId ?? principal.id
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "payouts.approved", payoutIds: ids, detached },
        outboxIds: [told]
      })
      return { change: new AffiliatesChange({ ids, undo }), outboxIds: [told] }
    })
  ))
})

/** "Markeer als betaald": the brand paid an approved payout outside Insyte, with its reference. */
export const markPaid = Effect.fn("Affiliates.markPaid")(function*(input: MarkPaidInput) {
  yield* Policy.require("affiliates", 3)
  yield* everyStore
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const reference = input.reference?.trim() || null
  if (reference !== null && reference.length > 200) return yield* new Invalid({ fields: { reference: "length" } })
  return yield* kicked(db.scoped((sql) =>
    Effect.gen(function*() {
      const paid = yield* sql<{ id: string }>`
        update affiliate_payouts set status = 'paid', paid_by = ${principal.id}, paid_at = now(),
               paid_minor = approvable_minor, reference = ${reference}
        where month = ${input.month} and affiliate_id in ${sql.in([...input.affiliateIds])} and status = 'approved'
        returning id`
      if (paid.length === 0) return yield* new Conflict({ entity: "affiliate_payout", reason: "not_approved" })
      const ids = paid.map((p) => p.id)
      yield* sql`update affiliate_conversions set status = 'paid' where payout_id in ${
        sql.in(ids)
      } and status = 'approved'`
      for (const id of ids) yield* audit(sql, "affiliate.payout_paid", "affiliate_payout", id, { month: input.month })
      const told = yield* Outbox.write(sql, principal.workspaceId, {
        type: "affiliate.payout",
        workspaceId: principal.workspaceId,
        step: "paid",
        payoutIds: ids,
        userId: principal.userId ?? principal.id
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "payouts.paid", payoutIds: ids },
        outboxIds: [told]
      })
      return { change: new AffiliatesChange({ ids, undo }), outboxIds: [told] }
    })
  ))
})

/** The payouts' undo: back to approvable (the detached conversions back in), or back to approved. */
export const restorePayouts = (
  sql: SqlClient.SqlClient,
  undo:
    | {
      readonly kind: "payouts.approved"
      readonly payoutIds: ReadonlyArray<string>
      readonly detached: ReadonlyArray<{ readonly id: string; readonly payoutId: string }>
    }
    | { readonly kind: "payouts.paid"; readonly payoutIds: ReadonlyArray<string> }
) =>
  Effect.gen(function*() {
    if (undo.kind === "payouts.approved") {
      yield* sql`update affiliate_payouts set status = 'approvable', approved_by = null, approved_at = null,
                   method_snapshot = null
                 where id in ${sql.in([...undo.payoutIds, ""])} and status = 'approved'`
      for (const d of undo.detached) {
        yield* sql`update affiliate_conversions set payout_id = ${d.payoutId}
                   where id = ${d.id} and payout_id is null and status = 'pending'`
      }
      yield* refreshPayouts(sql)
      for (const id of undo.payoutIds) yield* audit(sql, "affiliate.payout_unapproved", "affiliate_payout", id)
      return
    }
    yield* sql`update affiliate_conversions set status = 'approved'
               where payout_id in ${sql.in([...undo.payoutIds, ""])} and status = 'paid'`
    yield* sql`update affiliate_payouts set status = 'approved', paid_by = null, paid_at = null, paid_minor = null,
                 reference = null
               where id in ${sql.in([...undo.payoutIds, ""])} and status = 'paid'`
    for (const id of undo.payoutIds) yield* audit(sql, "affiliate.payout_unpaid", "affiliate_payout", id)
  })
