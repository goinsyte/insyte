import { describe, expect, it } from "vitest"
import { support } from "../src/analytics/use-cases/findings.ts"
import type { TicketsCell } from "../src/analytics/use-cases/reads.ts"

/*
 * Analyse's support finding sets the hours to done of tickets that came in at the weekend against those of the week.
 * Hours are read only where tickets were done: with none done there is no finding, and a side with none has no hours
 * (null), never 0 u.
 */

const cell = (weekday: number, created: number, resolved: number, hours: number): TicketsCell => ({
  weekday,
  topic: null,
  created,
  resolved,
  minutes: resolved * hours * 60
})

describe("Analyse's support finding", () => {
  it("says nothing while no ticket is done", () => {
    expect(support([cell(6, 2, 0, 0), cell(2, 3, 0, 0)], [])).toBeUndefined()
  })

  it("has no weekend hours without a ticket done at the weekend, nor B's without one done in B", () => {
    const found = support([cell(6, 2, 0, 0), cell(2, 3, 3, 4)], [])
    expect(found?.figures).toMatchObject({ weekend: null, weekday: 4, resolveA: 4, resolveB: null })
    expect(found?.tone).toBe("good")
    expect(support([cell(0, 2, 2, 10), cell(2, 3, 0, 0)], [cell(1, 1, 1, 2)])?.figures).toMatchObject({
      weekend: 10,
      weekday: null,
      resolveB: 2
    })
  })

  it("compares the hours where tickets were done on both sides, leaving days without one out", () => {
    const found = support([cell(6, 2, 2, 10), cell(0, 1, 0, 0), cell(2, 3, 3, 4), cell(3, 1, 0, 0)], [])
    expect(found?.figures).toMatchObject({ weekend: 10, weekday: 4, weekendTickets: 3, tickets: 7 })
    expect(found?.tone).toBe("bad")
    // Sunday and Wednesday had nothing done: no hours to show, rather than 0 u.
    expect(found?.drivers.map((d) => [d.key, d.a])).toEqual([["2", 4], ["6", 10]])
  })
})
