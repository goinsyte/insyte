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
