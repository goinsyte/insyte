import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type { AnalyticsPeriods } from "@insyte/modules/analytics/domain/Analytics"
import { describe, expect, it } from "vitest"
import { pairFor } from "../src/analytics/analytics-source.ts"

/*
 * The two months Analyse opens on: the member's saved pair where the pickers offer it, else this month against the one
 * before, and never a month against itself.
 */

const periods = (months: ReadonlyArray<string>, current: string) =>
  ({
    months: months.map((month) => ({ month, days: 30, inProgress: month === current, toDay: null })),
    current
  }) as unknown as AnalyticsPeriods

const frame = (saved?: { a: string; b: string }) =>
  ({ prefs: { sections: saved === undefined ? {} : { analytics: { value: saved } } } }) as unknown as Frame

describe("Analyse's pair", () => {
  it("compares this month with the one before", () => {
    expect(pairFor(frame(), periods(["2026-10", "2026-11"], "2026-11"))).toEqual({ a: "2026-11", b: "2026-10" })
  })

  it("never compares a saved month with itself", () => {
    const offered = periods(["2026-09", "2026-10", "2026-11"], "2026-11")
    expect(pairFor(frame({ a: "2026-11", b: "2026-11" }), offered)).toEqual({ a: "2026-11", b: "2026-10" })
    expect(pairFor(frame({ a: "2026-09", b: "2026-09" }), offered)).toEqual({ a: "2026-09", b: "2026-10" })
    expect(pairFor(frame({ a: "2026-11", b: "2026-09" }), offered)).toEqual({ a: "2026-11", b: "2026-09" })
  })
})
