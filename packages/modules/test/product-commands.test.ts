import { describe, expect, it } from "vitest"
import { htmlOf, priceAt } from "../src/products/domain/Commands.ts"
import { fromMinor, toMinor } from "../src/stores/domain/Mirror.ts"

/* The product commands' pure rules (M7.3): prices at a margin, the page's text as Shopify's description, money. */

describe("the product commands' rules", () => {
  it("prices at a margin over the cost, to the whole unit, never below one", () => {
    expect(priceAt(2000, 0.6)).toBe(5000)
    expect(priceAt(3560, 0.6)).toBe(8900)
    expect(priceAt(1234, 0.5)).toBe(2500)
    expect(priceAt(10, 0.05)).toBe(100)
  })

  it("writes the page's plain text as paragraphs, escaped", () => {
    expect(htmlOf("Zacht linnen.\n\nWasbaar op 30 graden.")).toBe("<p>Zacht linnen.</p><p>Wasbaar op 30 graden.</p>")
    expect(htmlOf("Maat <M> & L\nkort")).toBe("<p>Maat &lt;M&gt; &amp; L<br>kort</p>")
    expect(htmlOf("   ")).toBe("")
  })

  it("writes minor units back as Shopify's decimal string", () => {
    expect(fromMinor(5495, "EUR")).toBe("54.95")
    expect(fromMinor(5, "EUR")).toBe("0.05")
    expect(fromMinor(1200, "JPY")).toBe("1200")
    expect(toMinor(fromMinor(123456, "EUR"), "EUR")).toBe(123456)
  })
})
