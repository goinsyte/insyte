import { describe, expect, it } from "vitest"
import { quietUntil } from "../src/notifications/domain/Quiet.ts"

/*
 * Quiet hours (M11 step 13.5): a push or Slack message raised inside them waits for their end, in the workspace's
 * timezone; one raised outside them goes now.
 */

const AMS = "Europe/Amsterdam"
const night = { on: true, from: "22:00", to: "07:00", weekend: false }

describe("quiet hours", () => {
  it("lets a message go at once outside them, or when they are off", () => {
    // Tuesday 10 November 2026, 14:00 in Amsterdam (13:00 UTC).
    expect(quietUntil(new Date("2026-11-10T13:00:00Z"), night, AMS)).toBeNull()
    expect(quietUntil(new Date("2026-11-10T22:30:00Z"), { ...night, on: false }, AMS)).toBeNull()
  })

  it("holds an evening message until the next morning, and a night one until that morning", () => {
    // 23:30 on Tuesday → Wednesday 07:00 (06:00 UTC).
    expect(quietUntil(new Date("2026-11-10T22:30:00Z"), night, AMS)).toEqual(new Date("2026-11-11T06:00:00Z"))
    // 03:00 on Wednesday → 07:00 the same day.
    expect(quietUntil(new Date("2026-11-11T02:00:00Z"), night, AMS)).toEqual(new Date("2026-11-11T06:00:00Z"))
  })

  it("holds hours that do not cross midnight until they end that day", () => {
    const lunch = { on: true, from: "12:00", to: "13:30", weekend: false }
    expect(quietUntil(new Date("2026-11-10T11:15:00Z"), lunch, AMS)).toEqual(new Date("2026-11-10T12:30:00Z"))
    expect(quietUntil(new Date("2026-11-10T12:45:00Z"), lunch, AMS)).toBeNull()
  })

  it("keeps the weekend quiet whole, until Monday at the hours' end, with the weekend on", () => {
    const weekend = { ...night, weekend: true }
    // Saturday 14 November, 14:00 → Monday 16 November, 07:00.
    expect(quietUntil(new Date("2026-11-14T13:00:00Z"), weekend, AMS)).toEqual(new Date("2026-11-16T06:00:00Z"))
    // Friday 23:00 → not Saturday morning, but Monday.
    expect(quietUntil(new Date("2026-11-13T22:00:00Z"), weekend, AMS)).toEqual(new Date("2026-11-16T06:00:00Z"))
    // Without it, Saturday afternoon is not quiet.
    expect(quietUntil(new Date("2026-11-14T13:00:00Z"), night, AMS)).toBeNull()
  })

  it("ends at the local time on a day the clocks change", () => {
    // Sunday 29 March 2026, 03:00 → the clocks went forward at 02:00; 07:00 is 05:00 UTC.
    expect(quietUntil(new Date("2026-03-29T01:30:00Z"), night, AMS)).toEqual(new Date("2026-03-29T05:00:00Z"))
  })
})
