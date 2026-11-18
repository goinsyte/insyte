import { describe, expect, it } from "vitest"
import { landingUrl } from "../src/affiliates/use-cases/click.ts"
import { maskAccount } from "../src/affiliates/use-cases/portal.ts"
import { codeFrom, commissionOf, monthOf, payDayOf, previousMonth } from "../src/affiliates/use-cases/program.ts"
import { looksLike } from "../src/affiliates/use-cases/team.ts"
import { proposedCode } from "../src/members/use-cases/invitations/accept.ts"

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

describe("an invited affiliate's first code", () => {
  it("is the name's first word and a random part, never the name alone", () => {
    const code = proposedCode("WELCOME10")
    expect(code).toMatch(/^WELCOME1[A-Z2-9]{4}$/)
    expect(code).not.toBe("WELCOME10")
    expect(proposedCode("Émile de Vries")).toMatch(/^EMILE[A-Z2-9]{4}$/)
    expect(new Set(Array.from({ length: 20 }, () => proposedCode("Anna"))).size).toBeGreaterThan(1)
  })
})

describe("a resource's file", () => {
  const bytes = (...b: Array<number>) => new Uint8Array(b)
  const text = (t: string) => new TextEncoder().encode(t)
  it("is what its type says, by its own first bytes", () => {
    expect(looksLike("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(true)
    expect(looksLike("image/png", text("<html><script>"))).toBe(false)
    expect(looksLike("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true)
    expect(looksLike("application/pdf", text("%PDF-1.7"))).toBe(true)
    expect(looksLike("application/zip", bytes(0x50, 0x4b, 0x03, 0x04))).toBe(true)
    expect(looksLike("image/webp", text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe(true)
    expect(looksLike("video/mp4", text("\u0000\u0000\u0000\u0018ftypmp42"))).toBe(true)
    expect(looksLike("image/svg+xml", text("<?xml version=\"1.0\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\"/>")))
      .toBe(
        true
      )
    expect(looksLike("image/svg+xml", text("<html><body><svg/></body></html>"))).toBe(false)
    expect(looksLike("text/html", text("<html>"))).toBe(false)
  })
})
