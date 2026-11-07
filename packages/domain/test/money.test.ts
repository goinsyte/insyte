import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Money, NonNegativeMoney } from "../src/Money.ts"

describe("Money", () => {
  it("is integer minor units", () => {
    expect(Schema.decodeSync(Money)({ minor: 1250, currency: "EUR" })).toEqual({ minor: 1250, currency: "EUR" })
    expect(() => Schema.decodeSync(Money)({ minor: 12.5, currency: "EUR" })).toThrow()
  })

  it("rejects an unknown currency", () => {
    expect(() => Schema.decodeUnknownSync(Money)({ minor: 100, currency: "BTC" })).toThrow()
  })

  it("has a non-negative variant", () => {
    expect(() => Schema.decodeSync(NonNegativeMoney)({ minor: -1, currency: "EUR" })).toThrow()
    expect(Schema.decodeSync(NonNegativeMoney)({ minor: 0, currency: "EUR" }).minor).toBe(0)
  })
})
