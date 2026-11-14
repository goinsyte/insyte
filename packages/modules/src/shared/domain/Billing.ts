import { Schema } from "effect"

/*
 * The plans a workspace can try and the trial's length (M4.1 `plan`; M13 attaches Stripe). The ids are the onboarding
 * step's and the landing's (`packages/ui/src/marketing/plans.ts`); prices are not the server's business until M13.
 */

export const PlanId = Schema.Literals(["starter", "growth", "scale"])
export type PlanId = typeof PlanId.Type

/** As the onboarding step's toggle names them: "Maandelijks", "Jaarlijks". */
export const BillingCycle = Schema.Literals(["monthly", "annual"])
export type BillingCycle = typeof BillingCycle.Type

/** "14 dagen gratis. Geen kaart nodig om te starten." */
export const TRIAL_DAYS = 14

/** Seats per plan, as the design's Billing prices them (`PLAN_SEATS` in the console); Stripe owns extra seats in M13. */
export const PLAN_SEATS: Record<PlanId, number> = { starter: 3, growth: 6, scale: 12 }

/** Before a plan is picked, the trial's seats (M3.4). */
export const TRIAL_SEATS = 5

/** The seats a workspace's plan includes: `workspaces.plan` is a plan id, or `trial` until onboarding's plan step. */
export const seatsOf = (plan: string): number => (PLAN_SEATS as Record<string, number | undefined>)[plan] ?? TRIAL_SEATS

/** What each plan includes beside its seats (M13; widgets/05 §4): entitlements are code, prices are Stripe's. */
export const PLAN_STORES: Record<PlanId, number> = { starter: 1, growth: 3, scale: 5 }

/** AI answers a period, per plan. */
export const PLAN_AI_REPLIES: Record<PlanId, number> = { starter: 1000, growth: 2500, scale: 5000 }

/** Active automations, the same for every plan (the design's "/ 50"). */
export const ACTIVE_AUTOMATIONS = 50

/** Before a plan is picked, the trial's stores and AI answers: as Scale, so a trial is not held back. */
export const TRIAL_STORES = PLAN_STORES.scale
export const TRIAL_AI_REPLIES = PLAN_AI_REPLIES.scale

export const isPlanId = (plan: string): plan is PlanId => plan in PLAN_SEATS

/**
 * The statuses that hold a paid plan's seats, stores and answers: paying, or in Stripe's grace while a payment is
 * retried.
 */
const ENTITLED_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"])

/** After a paid subscription is no longer paid for: Starter's limits, until a plan is paid for again. */
export const LAPSED_PLAN: PlanId = "starter"

/**
 * Where a workspace stands for its limits: `paid` while its subscription is paid for; `lapsed` once one was and no
 * longer is (ended, unpaid, paused); otherwise `trial`, on what the workspace picked (a first payment not made yet holds
 * nothing more).
 */
export type Standing = "paid" | "lapsed" | "trial"

export const standingOf = (status: string | null | undefined, startedAt: Date | null | undefined): Standing => {
  if (status !== null && status !== undefined && ENTITLED_STATUSES.has(status)) return "paid"
  if (startedAt !== null && startedAt !== undefined) return "lapsed"
  return status === "canceled" || status === "unpaid" || status === "paused" ? "lapsed" : "trial"
}

/**
 * The plan whose limits hold: the paid plan while it is paid for, Starter's once lapsed, the picked plan on a trial;
 * `null` on a trial before a plan is picked (the trial's own limits).
 */
export const holdingPlan = (standing: Standing, paidPlan: PlanId | null, workspacePlan: string): PlanId | null => {
  const picked = isPlanId(workspacePlan) ? workspacePlan : null
  if (standing === "paid") return paidPlan ?? picked
  if (standing === "lapsed") return LAPSED_PLAN
  return picked
}
