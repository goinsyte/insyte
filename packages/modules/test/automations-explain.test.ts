import { describe, expect, it } from "vitest"
import { explain } from "../src/automations/use-cases/engine.ts"

/*
 * A refund a run's step was refused says why in its history, with the amount the refusal names, and a refund Insyte
 * could not hold to the limit for want of a rate says that, not that the record changed.
 */

const nbsp = (s: string) => s.replace(/ /g, " ")

describe("a refused refund in a run's history", () => {
  it("names the limit and what is left on the order", () => {
    const over = explain("action.refund", {
      _tag: "RefundOverLimit",
      limitMinor: 10_000,
      currency: "EUR",
      roleMinor: 10_000,
      roleCurrency: "EUR"
    })
    expect(nbsp(over.explanation)).toBe(
      "Het bedrag is meer dan de flow per bestelling mag terugbetalen (€ 100,00); er is niets terugbetaald."
    )
    expect(over.terminal).toBe(true)
    expect(
      nbsp(explain("action.refund", { _tag: "RefundOverBalance", balanceMinor: 1250, currency: "JPY" }).explanation)
    )
      .toBe("Het bedrag is meer dan er nog op de bestelling openstaat (JP¥ 1.250); er is niets terugbetaald.")
    // A refusal that names no currency names no amount, rather than one in a currency guessed at.
    expect(explain("action.refund", { _tag: "RefundOverBalance", balanceMinor: 1250 }).explanation)
      .toBe("Het bedrag is meer dan er nog op de bestelling openstaat; er is niets terugbetaald.")
  })

  it("says a missing rate, not a changed record", () => {
    expect(explain("action.refund", { _tag: "Conflict", entity: "refund", reason: "no_fx_rate" }).explanation)
      .toMatch(/^Er is nog geen wisselkoers/)
    expect(explain("action.refund", { _tag: "Conflict", entity: "order", reason: "closed" }).explanation)
      .toBe("Het record veranderde intussen; de stap is niet uitgevoerd.")
  })
})
