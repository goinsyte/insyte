import type { BillingPlans } from "@insyte/modules/billing/domain/Billing"
import type { PlanTile } from "@insyte/ui/app/lib/plan-tile"
import { money } from "../settings/money.ts"

/*
 * Onboarding's plan step over `Billing.plans`: each tile says what the server holds the plan to (its seats, stores and
 * AI answers, as Facturatie says them) and what Stripe charges for it, in Stripe's currency. A price Stripe does not
 * have is `null` (the tile shows a dash), and a read that failed leaves the tiles with their names only.
 */

const ORDER = ["starter", "growth", "scale"] as const
const NAMES: Record<(typeof ORDER)[number], string> = { starter: "Starter", growth: "Growth", scale: "Scale" }

export const planTiles = (plans: BillingPlans | undefined): ReadonlyArray<PlanTile> =>
  ORDER.map((id) => {
    const offer = plans?.plans.find((p) => p.plan === id)
    const currency = plans?.currency ?? "eur"
    return {
      id,
      name: NAMES[id],
      hint: offer === undefined ?
        "" :
        `${offer.seats} plekken · ${offer.stores} ${offer.stores === 1 ? "winkel" : "winkels"} · ${
          offer.aiReplies.toLocaleString("nl-NL")
        } AI-antwoorden`,
      monthly: offer?.monthlyMinor === null || offer?.monthlyMinor === undefined
        ? null
        : money(offer.monthlyMinor, currency),
      // A year's price, a month at a time: the tile says "/mnd" on both cycles.
      annual: offer?.annualMinor === null || offer?.annualMinor === undefined
        ? null
        : money(Math.round(offer.annualMinor / 12), currency)
    }
  })
