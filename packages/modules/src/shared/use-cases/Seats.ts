import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { holdingPlan, isPlanId, PLAN_SEATS, type PlanId, standingOf, TRIAL_SEATS } from "../domain/Billing.ts"

/*
 * The workspace's seats, on the caller's transaction inside it (M3.4, M13 step 1): the plan's own seats plus those bought
 * beyond it (`subscriptions.extra_seats`, as Stripe last said), against active people plus open invitations that have
 * not lapsed. A paid plan and its bought seats count only while the subscription is paid for (active, or in Stripe's
 * grace while a payment is retried); once it no longer is, Starter's seats do (`standingOf`), and on a trial the picked
 * plan's. Deactivated people free their seat. The team page, inviting, accepting and billing all count with this. The
 * figures come from `workspace_seat_facts()` (0096), so someone accepting an invitation counts the seats without
 * reading the subscription or the other invitations.
 */

export interface SeatCount {
  readonly included: number
  readonly extra: number
  readonly total: number
  readonly used: number
  readonly active: number
  readonly pending: number
  readonly free: number
  readonly full: boolean
}

export const seatCount = Effect.fn("Seats.count")(function*(sql: SqlClient.SqlClient) {
  const [row] = yield* sql<{
    workspacePlan: string
    status: string | null
    plan: string | null
    extra: number | null
    startedAt: Date | null
    active: number
    pending: number
  }>`
    select workspace_plan, status, plan, extra_seats as extra, started_at, active, pending from workspace_seat_facts()`
  const standing = standingOf(row?.status, row?.startedAt)
  const paidPlan: PlanId | null = row?.plan !== null && row?.plan !== undefined && isPlanId(row.plan) ? row.plan : null
  const holds = holdingPlan(standing, paidPlan, row?.workspacePlan ?? "trial")
  const included = holds === null ? TRIAL_SEATS : PLAN_SEATS[holds]
  const extra = standing === "paid" ? (row?.extra ?? 0) : 0
  const total = included + extra
  const active = row?.active ?? 0
  const pending = row?.pending ?? 0
  const used = active + pending
  return {
    included,
    extra,
    total,
    used,
    active,
    pending,
    free: Math.max(0, total - used),
    full: used >= total
  } satisfies SeatCount
})
