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
