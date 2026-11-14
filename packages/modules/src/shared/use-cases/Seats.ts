import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { seatsOf } from "../domain/Billing.ts"

/*
 * The workspace's seats, on the caller's transaction inside it (M3.4, M13 step 1): the plan's own seats plus those bought
 * beyond it (`subscriptions.extra_seats`, as Stripe last said), against active people plus open invitations that have
 * not lapsed. Deactivated people free their seat. The team page, inviting, accepting and billing all count with this.
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
  const [row] = yield* sql<{ plan: string; extra: number; active: number; pending: number }>`
    select coalesce(s.plan, w.plan) as plan,
           coalesce(s.extra_seats, 0)::int as extra,
           (select count(*)::int from members where removed_at is null and deactivated_at is null) as active,
           (select count(*)::int from invitations
              where accepted_at is null and revoked_at is null and declined_at is null and expires_at > now()) as pending
    from workspaces w
    left join subscriptions s on s.workspace_id = w.id`
  const included = seatsOf(row?.plan ?? "trial")
  const extra = row?.extra ?? 0
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
