import { describe, expect, it } from "vitest"
import { offeredMonths } from "../src/analytics/use-cases/reads.ts"

/*
 * The months Analyse's pickers offer (M14 step 2): from the first order's month to the current one, and never only the
 * current one, so the page never compares a month with itself.
 */

describe("Analyse's months", () => {
  it("offers the month before for a store whose first order is this month, or that has none yet", () => {
    expect(offeredMonths("2026-11", "2026-11")).toEqual(["2026-10", "2026-11"])
    expect(offeredMonths(null, "2026-11")).toEqual(["2026-10", "2026-11"])
    expect(offeredMonths(null, "2026-01")).toEqual(["2025-12", "2026-01"])
  })

  it("starts at the first order's month where that is earlier", () => {
    expect(offeredMonths("2026-08", "2026-11")).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"])
    expect(offeredMonths("2026-10", "2026-11")).toEqual(["2026-10", "2026-11"])
  })
})
