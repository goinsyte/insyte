import { describe, expect, it } from "vitest"
import { cardState, type WidgetsShown } from "../src/start/card-state.ts"

/*
 * What one of Start's read cards shows (M10.3). The case worth a test: a card added to the board while the last read
 * is still on screen. That read was not asked for it, so leaving it out says nothing about the role: the card waits
 * for its own read, and only says it could not be loaded when the read for the board as it is failed.
 */

type Id = "revenue" | "automations"

const shown = (asked: ReadonlyArray<Id>, failed = false): WidgetsShown<Id> => ({ asked: new Set(asked), failed })

describe("a Start card", () => {
  it("shows its bones until the first read is in", () => {
    expect(cardState<Id>(undefined, undefined, "revenue")).toBe("bones")
    expect(cardState<Id>(shown(["revenue"]), undefined, "revenue")).toBe("bones")
  })

  it("draws the figures of a read that asked for it", () => {
    expect(cardState<Id>(shown(["revenue"]), { revenue: 12 }, "revenue")).toBe("draw")
  })

  it("says the role may not read it when a read asked for it and left it out", () => {
    expect(cardState<Id>(shown(["revenue", "automations"]), { revenue: 12 }, "automations")).toBe("role")
  })

  it("waits for its own read when it was added after the read on screen", () => {
    expect(cardState<Id>(shown(["revenue"]), { revenue: 12 }, "automations")).toBe("bones")
  })

  it("says it could not be loaded when the read for the board as it is failed", () => {
    expect(cardState<Id>(shown(["revenue"], true), { revenue: 12 }, "automations")).toBe("failed")
  })

  it("keeps the figures it has while a later read fails", () => {
    expect(cardState<Id>(shown(["revenue"], true), { revenue: 12 }, "revenue")).toBe("draw")
  })
})
