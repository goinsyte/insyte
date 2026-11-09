import { describe, expect, it } from "vitest"
import { supplierOrderOf } from "../src/forwarding/use-cases/send.ts"

/*
 * What a supplier receives of an order (M8: "a supplier payload never contains the customer's email or phone"). The
 * address it ships to keeps the name and the street; the phone on that address, and anything else about the customer,
 * stays behind.
 */

describe("the order a supplier receives", () => {
  it("carries their lines and where to ship them, never the customer's email or phone", () => {
    const order = supplierOrderOf({
      id: "fwd_1",
      number: "#1042",
      placedAt: new Date("2026-11-09T10:00:00Z"),
      note: "Graag snel",
      address: {
        name: "Anna de Vries",
        line1: "Prinsengracht 263",
        line2: null,
        city: "Amsterdam",
        postcode: "1016 GV",
        region: null,
        country: "NL",
        phone: "+31 6 12345678",
        email: "anna@example.com"
      },
      lines: [{ sku: "LIN-M", title: "Linnen overhemd", variantTitle: "M", quantity: 1 }]
    })
    expect(order.ship_to).toEqual({
      name: "Anna de Vries",
      line1: "Prinsengracht 263",
      line2: null,
      city: "Amsterdam",
      postcode: "1016 GV",
      region: null,
      country: "NL"
    })
    const text = JSON.stringify(order)
    expect(text).not.toContain("+31 6 12345678")
    expect(text).not.toContain("anna@example.com")
    expect(text).not.toMatch(/phone|email|price|total/i)
  })
})
