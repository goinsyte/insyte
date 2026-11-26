import { describe, expect, it } from "vitest"
import { LOW_STOCK } from "../src/products/domain/Products.ts"
import { stockOf } from "../src/supplier-portal/use-cases/queries.ts"

/*
 * The supplier portal's stock word, by the console's rule: the brand and its supplier read the same counts alike.
 */

describe("a supplier's stock", () => {
  it("is low only where a variant is at or under the console's threshold", () => {
    // Fifty of one variant is in stock, as the console says; it was "Lage voorraad" under its own 60.
    expect(stockOf(50, 50)).toBe("in_stock")
    expect(stockOf(62, 24)).toBe("in_stock")
    expect(stockOf(40, LOW_STOCK)).toBe("low")
    // One variant sold out while another has stock: low, not out.
    expect(stockOf(38, 0)).toBe("low")
    expect(stockOf(0, 0)).toBe("out")
    // Nothing counted (Shopify tracks none of its variants): nothing to run out of, as the console has no level for it.
    expect(stockOf(0, null)).toBe("in_stock")
  })
})
