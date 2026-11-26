import { describe, expect, it } from "vitest"
import { cellCommit } from "../src/app/lib/cost-cell.ts"

/*
 * Kosten's month field: focused, it opens with the amount; left, it saves what is in it. A month typed in another
 * currency with no rate to read it in opens empty, so tabbing through the table must not clear it.
 */

describe("a month's field in Kosten", () => {
  it("keeps a month typed in another currency when the field is left empty", () => {
    expect(cellCommit("", { amount: 0, typed: true, noRate: true })).toBe("keep")
    expect(cellCommit("  ", { amount: 0, typed: true, noRate: true })).toBe("keep")
  })

  it("replaces that month only with an amount typed over it, 0 too", () => {
    expect(cellCommit("49,50", { amount: 0, typed: true, noRate: true })).toEqual({ amount: 49.5 })
    expect(cellCommit("0", { amount: 0, typed: true, noRate: true })).toEqual({ amount: 0 })
  })

  it("clears a typed month emptied by hand, and leaves an unchanged one alone", () => {
    expect(cellCommit("", { amount: 120, typed: true })).toBe("clear")
    expect(cellCommit("120", { amount: 120, typed: true })).toBe("keep")
    expect(cellCommit("130", { amount: 120, typed: true })).toEqual({ amount: 130 })
  })

  it("does nothing for an empty or unreadable field on a month nobody typed", () => {
    expect(cellCommit("", { amount: 80, typed: false })).toBe("keep")
    expect(cellCommit("", undefined)).toBe("keep")
    expect(cellCommit("abc", { amount: 80, typed: false })).toBe("keep")
    expect(cellCommit("-5", { amount: 80, typed: false })).toBe("keep")
  })
})
