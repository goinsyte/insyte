import { describe, expect, it } from "vitest"
import {
  approvedStatus,
  DAY,
  DEFAULT_REASONS,
  IllegalReturnMove,
  move,
  pastDeadline,
  type ProductRule,
  resolutionAmount,
  resolutionsFor,
  returnRate,
  reviewDeadline,
  ruleFor,
  windowCheck,
  windowDaysFor
} from "../src/app/lib/returns.ts"

const NOW = Date.parse("2026-11-01T12:00:00Z")
const ALL = ["refund", "exchange", "gift_card", "replacement", "discount"] as const

describe("return windows", () => {
  it("is open until the last day and says when it closed", () => {
    expect(windowCheck(NOW - 29 * DAY, 30, NOW).inside).toBe(true)
    const late = windowCheck(NOW - 74 * DAY, 30, NOW)
    expect(late.inside).toBe(false)
    expect(late.daysSince).toBe(74)
    expect(late.closesOn.getTime()).toBe(NOW - 44 * DAY)
  })

  it("uses the reason's own window before the claim or return window", () => {
    const damaged = DEFAULT_REASONS.find((r) => r.id === "damaged")
    const small = DEFAULT_REASONS.find((r) => r.id === "too_small")
    expect(windowDaysFor("claim", damaged, { returnDays: 30, claimDays: 60 })).toBe(14)
    expect(windowDaysFor("return", small, { returnDays: 30, claimDays: 60 })).toBe(30)
    expect(windowDaysFor("claim", undefined, { returnDays: 30, claimDays: 60 })).toBe(60)
  })

  it("flags a review past its 48-hour deadline, and only while it is in review", () => {
    const created = new Date(NOW - 50 * 3_600_000).toISOString()
    expect(pastDeadline("review", reviewDeadline(created), NOW)).toBe(true)
    expect(pastDeadline("awaiting_parcel", reviewDeadline(created), NOW)).toBe(false)
  })
})

describe("product rules", () => {
  const rules: ProductRule[] = [
    { id: "r1", kind: "not_returnable", target: { by: "tag", tag: "sale" }, note: "Sale-artikelen ruilen we niet" },
    {
      id: "r2",
      kind: "exchange_only",
      target: { by: "product", productId: "prod_2018", label: "Cascade pufferjas" },
      note: ""
    },
    {
      id: "r3",
      kind: "refund_only",
      target: { by: "variant", variantId: "var_2018_l", label: "Cascade pufferjas · Groot" },
      note: ""
    }
  ]

  it("picks the most specific rule: variant, then product, then tag", () => {
    expect(ruleFor(rules, { productId: "prod_2018", variantId: "var_2018_l", tags: ["sale"] })?.id).toBe("r3")
    expect(ruleFor(rules, { productId: "prod_2018", variantId: "var_2018_m" })?.id).toBe("r2")
    expect(ruleFor(rules, { productId: "prod_2000", tags: ["sale"] })?.id).toBe("r1")
    expect(ruleFor(rules, { productId: "prod_2000" })).toBeUndefined()
  })

  it("offers what the rule allows", () => {
    expect(resolutionsFor(ALL, rules[0], "return")).toEqual([])
    expect(resolutionsFor(ALL, rules[1], "return")).toEqual(["exchange"])
    expect(resolutionsFor(ALL, rules[2], "claim")).toEqual(["refund"])
    expect(resolutionsFor(ALL, undefined, "return")).not.toContain("replacement")
    expect(resolutionsFor(ALL, undefined, "claim")).toContain("replacement")
  })
})

describe("transitions", () => {
  it("walks a return from review to resolved", () => {
    let s = move("review", approvedStatus("return", false))
    expect(s).toBe("awaiting_parcel")
    s = move(s, "in_transit")
    s = move(s, "received")
    s = move(s, "ready")
    expect(move(s, "resolved")).toBe("resolved")
  })

  it("takes a claim that keeps the item straight to be resolved", () => {
    expect(approvedStatus("claim", true)).toBe("ready")
    expect(move("review", "ready")).toBe("ready")
  })

  it("refuses to skip steps or reopen a resolved one", () => {
    expect(() => move("awaiting_parcel", "resolved")).toThrow(IllegalReturnMove)
    expect(() => move("resolved", "review")).toThrow(IllegalReturnMove)
  })
})

describe("money", () => {
  it("adds the gift card bonus and charges the exchange fee", () => {
    expect(resolutionAmount("gift_card", 100, { giftCardBonus: 10, exchangeFee: 0 })).toBe(110)
    expect(resolutionAmount("exchange", 100, { giftCardBonus: 10, exchangeFee: 4.95 })).toBe(4.95)
    expect(resolutionAmount("refund", 89, { giftCardBonus: 10, exchangeFee: 0 })).toBe(89)
  })

  it("reads a rate over units sold, zero when nothing sold", () => {
    expect(returnRate(4, 64)).toBeCloseTo(0.0625)
    expect(returnRate(3, 0)).toBe(0)
  })
})
