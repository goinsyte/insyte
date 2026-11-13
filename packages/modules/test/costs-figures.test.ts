import { describe, expect, it } from "vitest"
import { addMonths, costOf, figuresOf, type LineRule, monthsBetween } from "../src/costs/domain/Figures.ts"

/*
 * Kosten's calculation against the design's (`packages/ui/src/app/lib/costs.ts`, the oracle): the same rules, here in
 * minor units. The design rounds a share of revenue and an amount per order to cents in dollars; in cents that is the
 * same round. A typed month wins over what an account reports, an account that is not connected reports nothing, and a
 * month without revenue or ad spend has a margin and a ROAS of 0, never a division by zero.
 */

const NONE = new Map<string, number>()
const line = (kind: LineRule["kind"], patch: Partial<LineRule> = {}): LineRule => ({
  kind,
  rate: null,
  rateMinor: null,
  typed: NONE,
  account: null,
  ...patch
})

/** The design's rules, verbatim but for the unit: what `lib/costs.ts`'s `costOf` returns, times 100. */
const designCents = (l: LineRule, month: string, revenueCents: number, orders: number): number => {
  const revenue = revenueCents / 100
  if (l.kind === "fixed") return l.typed.get(month) ?? 0
  if (l.kind === "per_order") return Math.round(Math.round((l.rateMinor ?? 0) / 100 * orders * 100) / 100 * 100)
  if (l.kind === "percent") return Math.round(Math.round(((l.rate ?? 0) / 100) * revenue * 100) / 100 * 100)
  if (l.typed.get(month) !== undefined) return l.typed.get(month)!
  return l.account?.get(month) ?? 0
}

describe("what a cost line costs in a month", () => {
  const month = "2026-05"
  const basis = { revenueMinor: 16_505_037, orders: 1_594 }

  it("agrees with the design for every kind", () => {
    const lines = [
      line("percent", { rate: 38 }),
      line("percent", { rate: 2.9 }),
      line("per_order", { rateMinor: 140 }),
      line("fixed", { typed: new Map([[month, 1_840_000]]) }),
      line("fixed"),
      line("ads", { account: new Map([[month, 2_483_600]]) }),
      line("ads", { typed: new Map([[month, 289_000]]), account: new Map([[month, 999]]) }),
      line("ads")
    ]
    for (const l of lines) {
      expect(costOf(l, month, basis).amountMinor).toBe(designCents(l, month, basis.revenueMinor, basis.orders))
    }
  })

  it("says where each amount comes from", () => {
    expect(costOf(line("percent", { rate: 2.9 }), month, basis)).toMatchObject({ typed: false, source: "rule" })
    expect(costOf(line("fixed", { typed: new Map([[month, 39_900]]) }), month, basis))
      .toEqual({ amountMinor: 39_900, typed: true, source: "typed" })
    expect(costOf(line("ads", { account: new Map([[month, 100]]) }), month, basis))
      .toEqual({ amountMinor: 100, typed: false, source: "account" })
    expect(costOf(line("ads", { typed: new Map([[month, 5]]), account: new Map([[month, 100]]) }), month, basis))
      .toEqual({ amountMinor: 5, typed: true, source: "typed" })
    expect(costOf(line("ads"), month, basis)).toEqual({ amountMinor: 0, typed: false, source: "none" })
  })

  it("keeps a typed month on a share of revenue out of the sum: a rule is worked out, never typed", () => {
    const l = line("percent", { rate: 10, typed: new Map([[month, 1]]) })
    expect(costOf(l, month, basis).amountMinor).toBe(1_650_504)
  })
})

describe("a month's figures", () => {
  it("adds ads and the rest, and works out the net, the margin and the ROAS", () => {
    const f = figuresOf(
      [line("ads", { typed: new Map([["2026-05", 2_000]]) }), line("fixed", { typed: new Map([["2026-05", 3_000]]) })],
      "2026-05",
      { revenueMinor: 10_000, orders: 4 }
    )
    expect(f).toEqual({
      month: "2026-05",
      revenueMinor: 10_000,
      orders: 4,
      adsMinor: 2_000,
      otherMinor: 3_000,
      costsMinor: 5_000,
      netMinor: 5_000,
      margin: 0.5,
      roas: 5
    })
  })

  it("has a margin and a ROAS of 0 without revenue or ad spend", () => {
    const f = figuresOf([line("fixed", { typed: new Map([["2026-05", 4_900]]) })], "2026-05", {
      revenueMinor: 0,
      orders: 0
    })
    expect(f).toMatchObject({ netMinor: -4_900, margin: 0, roas: 0 })
  })
})

describe("months", () => {
  it("move across a year and list a range both ends included", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12")
    expect(addMonths("2025-11", 4)).toBe("2026-03")
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"])
    expect(monthsBetween("2026-03", "2026-02")).toEqual([])
  })
})
