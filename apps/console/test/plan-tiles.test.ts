import { BillingPlans } from "@insyte/modules/billing/domain/Billing"
import { describe, expect, it } from "vitest"
import { planTiles } from "../src/onboarding/plan-tiles.ts"

/*
 * Onboarding's plan tiles say what the server holds each plan to and what Stripe charges, not numbers of their own: the
 * seats a trial on Growth gets are the seats the team page counts, and the price is the one Facturatie shows.
 */

const plans = new BillingPlans({
  currency: "eur",
  plans: [
    { plan: "starter", monthlyMinor: 14_900, annualMinor: 160_920, seats: 3, stores: 1, aiReplies: 1000 },
    { plan: "growth", monthlyMinor: 29_900, annualMinor: null, seats: 6, stores: 3, aiReplies: 2500 },
    { plan: "scale", monthlyMinor: null, annualMinor: null, seats: 12, stores: 5, aiReplies: 5000 }
  ],
  seat: { monthlyMinor: null, annualMinor: null }
})

describe("the onboarding plan tiles", () => {
  it("say the server's seats, stores and AI answers", () => {
    const [starter, growth, scale] = planTiles(plans)
    expect(starter!.hint).toBe("3 plekken · 1 winkel · 1.000 AI-antwoorden")
    expect(growth!.hint).toBe("6 plekken · 3 winkels · 2.500 AI-antwoorden")
    expect(scale!.hint).toBe("12 plekken · 5 winkels · 5.000 AI-antwoorden")
  })

  it("price each plan in Stripe's currency, a year's price a month at a time", () => {
    const [starter, growth, scale] = planTiles(plans)
    expect(starter!.monthly).toMatch(/^€\s?149$/)
    expect(starter!.annual).toMatch(/^€\s?134,10$/)
    expect(growth!.monthly).toMatch(/^€\s?299$/)
    // No price in Stripe: no number made up.
    expect(growth!.annual).toBeNull()
    expect(scale!.monthly).toBeNull()
  })

  it("keep their names, and nothing else, when the plans could not be read", () => {
    expect(planTiles(undefined)).toEqual([
      { id: "starter", name: "Starter", hint: "", monthly: null, annual: null },
      { id: "growth", name: "Growth", hint: "", monthly: null, annual: null },
      { id: "scale", name: "Scale", hint: "", monthly: null, annual: null }
    ])
  })
})
