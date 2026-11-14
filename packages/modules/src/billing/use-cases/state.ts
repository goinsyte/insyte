import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import {
  ACTIVE_AUTOMATIONS,
  type BillingCycle,
  holdingPlan,
  isPlanId,
  PLAN_AI_REPLIES,
  PLAN_SEATS,
  PLAN_STORES,
  type PlanId,
  standingOf,
  TRIAL_AI_REPLIES,
  TRIAL_STORES
} from "../../shared/domain/Billing.ts"
import { seatCount } from "../../shared/use-cases/Seats.ts"
import { BillingOverview, type SubscriptionStatus } from "../domain/Billing.ts"
import type { InvoiceSnapshot, SubscriptionSnapshot, Target } from "../domain/Ports.ts"

/*
 * The billing cache, on the caller's transaction inside the workspace: the `subscriptions` row as a snapshot for the
 * port, the page's overview over it, and the writes that keep it as Stripe last said.
 */

export interface SubscriptionRow {
  readonly stripeCustomerId: string
  readonly stripeSubscriptionId: string | null
  readonly status: SubscriptionStatus | null
  readonly plan: PlanId | null
  readonly cycle: BillingCycle | null
  readonly extraSeats: number
  readonly currency: string | null
  readonly currentPeriodEnd: Date | null
  readonly cancelAt: Date | null
  readonly cardBrand: string | null
  readonly cardLast4: string | null
  readonly cardExpiry: string | null
  readonly startedBy: string | null
  readonly startedAt: Date | null
  readonly checkoutSessionId: string | null
  readonly checkoutKey: string | null
  readonly checkoutNonce: string | null
  readonly secondSubscriptionId: string | null
}

/** The most extra seats one subscription holds (`subscriptions.extra_seats`). */
export const MAX_EXTRA_SEATS = 500

/** The statuses whose subscription still bills or will: the row keeps it against another one at the same customer. */
const HOLDING: ReadonlyArray<SubscriptionStatus> = ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"]

export const subscriptionRow = Effect.fn("Billing.row")(function*(sql: SqlClient.SqlClient) {
  const [row] = yield* sql<SubscriptionRow>`
    select stripe_customer_id, stripe_subscription_id, status, plan, cycle, extra_seats, currency, current_period_end,
           cancel_at, card_brand, card_last4, card_expiry, started_by, started_at, checkout_session_id, checkout_key,
           checkout_nonce, second_subscription_id
    from subscriptions`
  return row
})

/** The row as the port's snapshot, where there is a subscription. */
export const snapshotOf = (row: SubscriptionRow | undefined, workspaceId: string): SubscriptionSnapshot | undefined =>
  row === undefined || row.stripeSubscriptionId === null || row.status === null ? undefined : {
    customerId: row.stripeCustomerId,
    subscriptionId: row.stripeSubscriptionId,
    status: row.status,
    plan: row.plan,
    cycle: row.cycle,
    extraSeats: row.extraSeats,
    currency: row.currency ?? "eur",
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAt: row.cancelAt,
    card: row.cardBrand === null || row.cardLast4 === null
      ? null
      : { brand: row.cardBrand, last4: row.cardLast4, expiry: row.cardExpiry ?? "" },
    workspaceId
  }

/**
 * The statuses that hold a paid plan: paying, or in Stripe's grace while a payment is retried. Anything else holds no
 * paid plan: Starter's limits once one was paid for (unpaid, paused, cancelled), the trial's before
 * (`shared/domain/Billing.ts` `standingOf`).
 */
const ENTITLED: ReadonlySet<SubscriptionStatus> = new Set(["active", "trialing", "past_due"])

const isEntitled = (status: SubscriptionStatus | null | undefined) =>
  status !== null && status !== undefined && ENTITLED.has(status)

/** A subscription that still bills (or will): a change applies to it; otherwise the next paid action starts anew. */
export const isLive = (s: SubscriptionSnapshot | undefined): s is SubscriptionSnapshot =>
  s !== undefined && s.status !== "canceled" && s.status !== "incomplete_expired"

/** The plan and cycle the workspace is on now, and its extra seats, as a change's starting point. */
export const currentTarget = (
  row: SubscriptionRow | undefined,
  workspacePlan: string
): Target => ({
  plan: row?.plan ?? (isPlanId(workspacePlan) ? workspacePlan : "starter"),
  cycle: row?.cycle ?? "monthly",
  // Seats bought on a subscription that has ended are not carried into a new one.
  extraSeats: row !== undefined && isLive(snapshotOf(row, "")) ? row.extraSeats : 0
})

interface WorkspaceRow {
  readonly plan: string
  readonly trialEndsAt: Date | null
  readonly name: string
  readonly legalEntity: string | null
  readonly billingEmail: string | null
}

export const workspaceRow = Effect.fn("Billing.workspace")(function*(sql: SqlClient.SqlClient) {
  const [row] = yield* sql<WorkspaceRow>`
    select plan, trial_ends_at, name, legal_entity, billing_email from workspaces`
  return row!
})

/** Connected stores now: a smaller plan must still hold them. */
export const connectedStores = Effect.fn("Billing.stores")(function*(sql: SqlClient.SqlClient) {
  const [row] = yield* sql<{ n: number }>`select count(*)::int as n from stores where status = 'connected'`
  return row?.n ?? 0
})

const ms = (d: Date | null) => (d === null ? null : d.getTime())

/** The page: the plan, its period, the card, the seats and what the workspace uses of its plan. */
export const overview = Effect.fn("Billing.overview")(function*(sql: SqlClient.SqlClient, configured: boolean) {
  const workspace = yield* workspaceRow(sql)
  const row = yield* subscriptionRow(sql)
  const live = row?.status !== null && row?.status !== undefined
  const plan: PlanId | null = row?.plan ?? (isPlanId(workspace.plan) ? workspace.plan : null)
  // What the workspace may use: the paid plan while it is paid for, Starter's once lapsed, the picked plan on a trial.
  const holds = holdingPlan(standingOf(row?.status, row?.startedAt), row?.plan ?? null, workspace.plan)
  const seats = yield* seatCount(sql)
  const stores = yield* connectedStores(sql)
  // This period's answers: since the paid period began, or since the start of the month on a trial.
  const [counts] = yield* sql<{ replies: number; automations: number }>`
    select (select count(*)::int from model_calls
              where outcome = 'ok' and not test
                and created_at >= coalesce(
                  ${row?.currentPeriodEnd ?? null}::timestamptz
                    - case when ${
    row?.cycle ?? "monthly"
  } = 'annual' then interval '1 year' else interval '1 month' end,
                  date_trunc('month', now()))) as replies,
           (select count(*)::int from automations where status = 'active' and deleted_at is null) as automations`
  return new BillingOverview({
    configured,
    plan,
    cycle: row?.cycle ?? "monthly",
    status: live ? row!.status! : "trial",
    trialEndsAt: ms(workspace.trialEndsAt),
    currentPeriodEnd: live ? ms(row!.currentPeriodEnd) : null,
    cancelAt: live ? ms(row!.cancelAt) : null,
    secondSubscription: (row?.secondSubscriptionId ?? null) !== null,
    card: row === undefined || row.cardBrand === null || row.cardLast4 === null
      ? null
      : { brand: row.cardBrand, last4: row.cardLast4, expiry: row.cardExpiry ?? "" },
    seats: {
      included: seats.included,
      extra: seats.extra,
      total: seats.total,
      used: seats.used,
      free: seats.free,
      full: seats.full
    },
    usage: {
      stores: { value: stores, max: holds === null ? TRIAL_STORES : PLAN_STORES[holds] },
      aiReplies: { value: counts?.replies ?? 0, max: holds === null ? TRIAL_AI_REPLIES : PLAN_AI_REPLIES[holds] },
      activeAutomations: { value: counts?.automations ?? 0, max: ACTIVE_AUTOMATIONS }
    }
  })
})

/** The seats a target includes, its own and bought. */
export const seatsOfTarget = (t: Target) => PLAN_SEATS[t.plan] + t.extraSeats

/**
 * The cache after Stripe answered or told: the subscription as it is now, unless a newer event already wrote it
 * (`at`, Stripe's time for a webhook; an answer to Insyte's own call is now), or the row holds another subscription that
 * still bills (`conflict`: a second one at the same customer is Stripe's to sort out, not a reason to drop the first).
 * The workspace's plan follows a paid plan while it is paid for. The Checkout page is let go once a subscription that
 * bills is written (an ended one arriving late keeps it). More extra seats than the row holds are kept at the most, and
 * said. `started` is true once, for the write that first sees it paid, however many webhooks race to it.
 */
export const writeSubscription = Effect.fn("Billing.writeSubscription")(
  function*(sql: SqlClient.SqlClient, workspaceId: string, s: SubscriptionSnapshot, at: Date) {
    if (s.extraSeats > MAX_EXTRA_SEATS) {
      yield* Effect.logError("stripe subscription has more extra seats than Insyte holds", {
        subscription: s.subscriptionId,
        extraSeats: s.extraSeats,
        kept: MAX_EXTRA_SEATS
      })
    }
    const extraSeats = Math.min(Math.max(0, s.extraSeats), MAX_EXTRA_SEATS)
    const live = isLive(s)
    const [written] = yield* sql<{ plan: PlanId | null }>`
      insert into subscriptions as t (workspace_id, stripe_customer_id, stripe_subscription_id, status, plan, cycle,
                                      extra_seats, currency, current_period_end, cancel_at, card_brand, card_last4,
                                      card_expiry, event_at, updated_at)
      values (${workspaceId}, ${s.customerId}, ${s.subscriptionId}, ${s.status}, ${s.plan}, ${s.cycle}, ${extraSeats},
              ${s.currency}, ${s.currentPeriodEnd}, ${s.cancelAt}, ${s.card?.brand ?? null}, ${s.card?.last4 ?? null},
              ${s.card?.expiry ?? null}, ${at}, now())
      on conflict (workspace_id) do update set
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        status = excluded.status,
        plan = coalesce(excluded.plan, t.plan),
        cycle = coalesce(excluded.cycle, t.cycle),
        extra_seats = excluded.extra_seats,
        currency = excluded.currency,
        current_period_end = excluded.current_period_end,
        cancel_at = excluded.cancel_at,
        card_brand = coalesce(excluded.card_brand, t.card_brand),
        card_last4 = coalesce(excluded.card_last4, t.card_last4),
        card_expiry = coalesce(excluded.card_expiry, t.card_expiry),
        cancel_reason = case when excluded.cancel_at is null then null else t.cancel_reason end,
        cancel_note = case when excluded.cancel_at is null then null else t.cancel_note end,
        checkout_session_id = case when ${live} then null else t.checkout_session_id end,
        checkout_key = case when ${live} then null else t.checkout_key end,
        checkout_nonce = case when ${live} then null else t.checkout_nonce end,
        second_subscription_id = case when t.second_subscription_id = excluded.stripe_subscription_id then null
                                      else t.second_subscription_id end,
        event_at = greatest(t.event_at, excluded.event_at),
        updated_at = now()
      where (t.event_at is null or t.event_at <= excluded.event_at)
        and (t.stripe_subscription_id is null
             or t.stripe_subscription_id = excluded.stripe_subscription_id
             or t.status not in ${sql.in([...HOLDING])})
      returning plan`
    if (written === undefined) {
      const [held] = yield* sql<{ id: string | null }>`
        select stripe_subscription_id as id from subscriptions
        where stripe_subscription_id is distinct from ${s.subscriptionId} and status in ${sql.in([...HOLDING])}`
      const conflict = held !== undefined && live
      // Another subscription that bills is kept on the row until Stripe says it has ended.
      yield* conflict
        ? sql`update subscriptions set second_subscription_id = ${s.subscriptionId}`
        : sql`update subscriptions set second_subscription_id = null
              where second_subscription_id = ${s.subscriptionId} and not ${live}`
      return { written: false, started: false, conflict }
    }
    // The workspace's plan is the last one paid for; while none is, its limits are Starter's (`standingOf`).
    if (written.plan !== null && isEntitled(s.status)) {
      yield* sql`update workspaces set plan = ${written.plan} where id = ${workspaceId} and plan <> ${written.plan}`
    }
    // One row lock decides it: a second writer waits, then finds `started_at` set.
    const started = isEntitled(s.status) && s.status !== "past_due"
      ? (yield* sql`
        update subscriptions set started_at = now()
        where workspace_id = ${workspaceId} and started_at is null
        returning 1`).length > 0
      : false
    return { written: true, started, conflict: false }
  }
)

/**
 * An invoice as Stripe last said it; an older event for it is ignored, and one that is settled (paid, void,
 * uncollectible) never goes back to open or draft, whatever order Stripe's events arrive in.
 */
export const writeInvoice = Effect.fn("Billing.writeInvoice")(
  function*(sql: SqlClient.SqlClient, workspaceId: string, i: InvoiceSnapshot, at: Date) {
    yield* sql`
      insert into invoices as t (id, workspace_id, number, status, amount_minor, currency, issued_at, hosted_url,
                                 pdf_url, event_at)
      values (${i.id}, ${workspaceId}, ${i.number}, ${i.status}, ${i.amountMinor}, ${i.currency}, ${i.issuedAt},
              ${i.hostedUrl}, ${i.pdfUrl}, ${at})
      on conflict (id) do update set
        number = excluded.number, status = excluded.status, amount_minor = excluded.amount_minor,
        currency = excluded.currency, hosted_url = excluded.hosted_url, pdf_url = excluded.pdf_url,
        event_at = excluded.event_at
      where t.workspace_id = excluded.workspace_id and (t.event_at is null or t.event_at <= excluded.event_at)
        and not (t.status in ('paid', 'void', 'uncollectible') and excluded.status in ('open', 'draft'))`
  }
)
