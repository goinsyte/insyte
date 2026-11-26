import { describe, expect, it } from "vitest"
import { amount, ORDER_EXPORT } from "../src/data/use-cases/sources.ts"

/*
 * The Data hub's order export, cell by cell: amounts as Dutch Excel reads them in the currency's own decimals, and
 * "Geplaatst" on the workspace's clock with its offset rather than in UTC.
 */

const line = {
  id: "ord_1",
  number: "#1001",
  customerName: "Test Shopper",
  customerEmail: null,
  totalMinor: "2495",
  currency: "USD",
  status: "paid",
  paymentStatus: "paid",
  fulfillmentStatus: "unfulfilled",
  lineCount: 1,
  trackingNumber: null,
  placedAt: new Date("2026-11-21T18:26:11.000Z"),
  placedKey: "2026-11-21 18:26:11+00",
  timezone: "Europe/Amsterdam"
}

describe("an order as the export writes it", () => {
  it("writes amounts with a decimal comma in the currency's decimals", () => {
    expect(ORDER_EXPORT.total.read(line)).toBe("24,95")
    expect(amount("2495", "JPY")).toBe("2495")
    expect(amount(100_000, "EUR ")).toBe("1000,00")
  })

  it("writes when it was placed in the workspace's timezone, with the offset", () => {
    expect(ORDER_EXPORT.placed.read(line)).toBe("2026-11-21T19:26:11+01:00")
    expect(ORDER_EXPORT.placed.read({ ...line, timezone: "America/New_York" })).toBe("2026-11-21T13:26:11-05:00")
  })
})
