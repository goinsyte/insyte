import { describe, expect, it } from "vitest"
import { CREATE_REFUSED, refusalOf } from "../src/shared/domain/ShopifyCreates.ts"

/* What Shopify refusing a draft order or a product comes down to (M7.1, M7.3), for the notification to its maker. */

describe("a Shopify refusal to make a record", () => {
  it("is the reason the first error's field names", () => {
    expect(refusalOf([{ field: ["input", "email"], message: "Email is invalid" }])).toBe("email")
    expect(refusalOf([{ field: ["input", "lineItems", "0", "quantity"], message: "must be positive" }])).toBe("lines")
    expect(refusalOf([{ field: ["product", "title"], message: "can't be blank" }])).toBe("title")
    expect(refusalOf([{ field: ["variants", "0", "price"], message: "must be greater than 0" }])).toBe("price")
    expect(refusalOf([{ field: ["variants", "0", "inventoryItem", "sku"], message: "is too long" }])).toBe("sku")
  })

  it("else what its message says, and else no reason", () => {
    expect(refusalOf([{ field: null, message: "Line item 1 is not available" }])).toBe("lines")
    expect(refusalOf([{ message: "Handle has already been taken", field: ["handle"] }])).toBe("title")
    expect(refusalOf([{ field: [], message: "Something went wrong" }])).toBe("other")
    expect(refusalOf([])).toBe("other")
  })

  it("says every reason in Dutch", () => {
    for (const sentence of Object.values(CREATE_REFUSED)) expect(sentence).toMatch(/^[A-Z].*\.$/)
  })
})
