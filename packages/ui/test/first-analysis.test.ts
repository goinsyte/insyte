import { describe, expect, it } from "vitest"
import { hoursFor, OFFLINE_ACTIONS, QUESTIONS } from "../src/app/lib/first-analysis.ts"

describe("the first analysis", () => {
  it("starts every question on one of its own answers", () => {
    for (const q of QUESTIONS) expect(q.options.map((o) => o.id)).toContain(q.initial)
  })

  it("keeps the offline plan to distinct actions", () => {
    const ids = OFFLINE_ACTIONS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(
    [
      ["evening", 5, "18:00"],
      ["late", 6, "22:00"],
      ["shifts", 7, "23:59"]
    ] as const
  )("opens the agent's hours for %s on %i days, until %s", (w, days, to) => {
    const hours = hoursFor(w)
    expect(hours).toHaveLength(7)
    expect(hours.filter((d) => d.open)).toHaveLength(days)
    expect(hours[0]?.to).toBe(to)
  })
})
