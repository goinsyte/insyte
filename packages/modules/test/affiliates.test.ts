import { describe, expect, it } from "vitest"
import { landingUrl } from "../src/affiliates/use-cases/click.ts"
import { maskAccount } from "../src/affiliates/use-cases/portal.ts"
import { codeFrom, commissionOf, monthOf, payDayOf, previousMonth } from "../src/affiliates/use-cases/program.ts"

/* The affiliate programme's pure parts (M16 steps 3–5): where a click lands, a code from a name, the months, masking. */

const row = {
  baseUrl: "https://winkel.example",
  path: "/products/linnen",
  campaign: "zomer",
  medium: "social",
  slug: "abcdefgh23"
}

describe("a click's landing", () => {
  it("is the store's own page with the link's tags and insyte_ref", () => {
    const url = new URL(landingUrl(row))
    expect(url.origin).toBe("https://winkel.example")
    expect(url.pathname).toBe("/products/linnen")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: "insyte",
      utm_medium: "social",
      utm_campaign: "zomer",
      insyte_ref: "abcdefgh23"
    })
  })

  it("never leaves the store, whatever the path says", () => {
    for (
      const path of ["//evil.example/x", "///evil.example", "https://evil.example", "/\\evil.example", "@evil.example"]
    ) {
      expect(new URL(landingUrl({ ...row, path })).origin).toBe("https://winkel.example")
    }
    // A base with a path or a query keeps only its origin.
    expect(new URL(landingUrl({ ...row, baseUrl: "https://winkel.example/nl?x=https://evil.example" })).origin)
      .toBe("https://winkel.example")
  })

  it("refuses a store address that is not https", () => {
    expect(() => landingUrl({ ...row, baseUrl: "http://winkel.example" })).toThrow()
    expect(() => landingUrl({ ...row, baseUrl: "javascript:alert(1)" })).toThrow()
  })
})

describe("the programme's arithmetic", () => {
  it("proposes a code from the first name, as Shopify takes it", () => {
    expect(codeFrom("Anna Jansen")).toBe("ANNA")
    expect(codeFrom("Émilie de Vries")).toBe("EMILIE")
    expect(codeFrom("Jo")).toBe("JOX")
    expect(codeFrom("Maximiliaan-Alexander")).toBe("MAXIMILIAA")
  })

  it("counts months in UTC and pays on the programme's day of the next month", () => {
    expect(monthOf(new Date("2026-11-30T23:30:00Z"))).toBe("2026-11")
    expect(previousMonth("2026-01")).toBe("2025-12")
    expect(payDayOf("2026-11", 15)).toBe("2026-12-15")
    expect(payDayOf("2026-12", 15)).toBe("2027-01-15")
  })

  it("rounds commission half up in minor units", () => {
    expect(commissionOf(4999, 10)).toBe(500)
    expect(commissionOf(1234, 12)).toBe(148)
    expect(commissionOf(0, 15)).toBe(0)
  })

  it("shows an account only masked", () => {
    expect(maskAccount("bank", "NL91 ABNA 0417 1643 00")).toBe("NL•• •••• •••• 4300")
    expect(maskAccount("paypal", "anna@creator.example")).toBe("a•••@creator.example")
    expect(maskAccount("bank", "NL91ABNA0417164300")).not.toContain("ABNA")
  })
})
