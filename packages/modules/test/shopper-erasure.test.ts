import { describe, expect, it } from "vitest"
import { needles } from "../src/shared/use-cases/ShopperErasure.ts"

/*
 * A shopper's erasure looks for them in every text the workspace keeps (`scrub_workspace`, 0076): their address,
 * name, phone and street, each matched whole, as typed and as JSON writes it. Too short a value would erase other
 * people's words, so it is not looked for.
 */
describe("what an erasure looks for", () => {
  it("escapes each value, matches it whole, and leaves out what is too short", () => {
    const found = needles(["anna@voorbeeld.nl", "Anna de Vries", "Jan", "12", "+31 6 1234 5678", "Hoofdstraat 1"])
    expect(found).toContain("(?<![[:alnum:]])anna@voorbeeld\\.nl(?![[:alnum:]])")
    expect(found).toContain("(?<![[:alnum:]])Anna de Vries(?![[:alnum:]])")
    expect(found).toContain("(?<![[:alnum:]])\\+31 6 1234 5678(?![[:alnum:]])")
    expect(found).toContain("(?<![[:alnum:]])Hoofdstraat 1(?![[:alnum:]])")
    expect(found.some((p) => p.includes("Jan"))).toBe(false)
    expect(found.some((p) => p.includes(">12("))).toBe(false)
  })

  it("looks for a value with a quote as JSON writes it too", () => {
    expect(needles(["Anna \"Ans\" Smit"])).toEqual([
      "(?<![[:alnum:]])Anna \"Ans\" Smit(?![[:alnum:]])",
      "(?<![[:alnum:]])Anna \\\\\"Ans\\\\\" Smit(?![[:alnum:]])"
    ])
  })
})
