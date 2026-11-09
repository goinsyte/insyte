import { describe, expect, it } from "vitest"
import { packingSlipHtml } from "../src/forwarding/domain/PackingSlip.ts"

/*
 * A packing slip (M8.5): the brand, the order, the address in Dutch (the country by name), the lines with their SKU; what
 * a shop wrote is escaped, so a title cannot become markup.
 */

describe("a packing slip", () => {
  it("names the order, the address and the lines, escaped", () => {
    const html = packingSlipHtml("Northwind & Co", {
      type: "order.forwarded",
      leg_id: "fwd_1",
      order: { number: "#1042", placed_at: "2026-11-09T10:00:00Z", note: null },
      ship_to: {
        name: "Anna de Vries",
        line1: "Prinsengracht 263",
        line2: null,
        city: "Amsterdam",
        postcode: "1016 GV",
        region: null,
        country: "NL"
      },
      lines: [{ sku: "LIN-M", title: "<b>Linnen</b> overhemd", variant_title: "M", quantity: 2 }]
    })
    expect(html).toContain("<h1>Northwind &amp; Co</h1>")
    expect(html).toContain("Pakbon · #1042")
    expect(html).toContain("<strong>Anna de Vries</strong><br>Prinsengracht 263<br>1016 GV Amsterdam<br>Nederland")
    expect(html).toContain("<td>2×</td><td>&lt;b&gt;Linnen&lt;/b&gt; overhemd · M</td><td class=\"sku\">LIN-M</td>")
    expect(html).not.toMatch(/€|\\d+,\\d{2}/)
  })
})
