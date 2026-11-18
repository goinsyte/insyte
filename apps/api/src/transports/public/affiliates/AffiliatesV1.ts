import type { AffiliateList, PayoutsView } from "@insyte/modules/affiliates/domain/Affiliates"
import { withAffiliates } from "@insyte/modules/affiliates/lazy"
import { Context, Effect, Layer } from "effect"
import { scopeMissing } from "../shared/errors.ts"
import { iso } from "../shared/time.ts"

/*
 * Affiliates (M16 steps 3–5), as the key the door let in: the affiliates and a month's payouts, read only. The slice
 * loads with the first call, not with the Worker (ADR-0041 §3).
 */

const money = (amount: number, currency: string) => ({ amount_minor: amount, currency })

const pageV1 = (list: AffiliateList) => ({
  data: list.rows.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    code: a.code,
    tier: a.tier,
    rate: a.rate,
    status: a.status,
    conversions: a.conversions,
    earned: money(a.earnedMinor, list.currency),
    discount: a.discount,
    joined_at: iso(a.joinedAt)!
  })),
  counts: {
    active: list.counts.active,
    paused: list.counts.paused,
    pending_applications: list.counts.pendingApplications
  },
  to_approve: money(list.toApproveMinor, list.currency)
})

const payoutsV1 = (v: PayoutsView) => ({
  month: v.month,
  closed: v.closed,
  pay_day: v.payDay,
  data: v.lines.map((l) => ({
    affiliate_id: l.affiliateId,
    name: l.name,
    payout_id: l.payoutId,
    orders: l.orders,
    approvable: money(l.approvableMinor, v.currency),
    in_window: money(l.inWindowMinor, v.currency),
    reversed: money(l.reversedMinor, v.currency),
    total: money(l.totalMinor, v.currency),
    status: l.status
  })),
  months: v.months
})

const make = Effect.succeed({
  affiliates: (
    query: {
      readonly status?: "active" | "paused" | undefined
      readonly tier?: "bronze" | "silver" | "gold" | undefined
    }
  ) =>
    withAffiliates((m) =>
      m.operator.list({
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.tier === undefined ? {} : { tier: query.tier })
      })
    ).pipe(Effect.map(pageV1), Effect.catchTag("Forbidden", scopeMissing)),
  payouts: (query: { readonly month?: string | undefined }) =>
    withAffiliates((m) => m.operator.payouts(query.month === undefined ? {} : { month: query.month })).pipe(
      Effect.map(payoutsV1),
      Effect.catchTag("Forbidden", scopeMissing)
    )
})

/**
 * Affiliates, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class AffiliatesV1 extends Context.Service<AffiliatesV1, Effect.Success<typeof make>>()(
  "api-worker/AffiliatesV1"
) {
  static readonly layer = Layer.effect(this, make)
}
