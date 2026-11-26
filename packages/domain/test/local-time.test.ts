import { describe, expect, it } from "vitest"
import { localIso } from "../src/LocalTime.ts"

/*
 * An export's "Geplaatst": the workspace's clock with its offset, so the file reads like the page and still names the
 * exact moment (a bare UTC "…Z" read as local time was an hour off in Amsterdam's winter).
 */

describe("a moment as a file writes it", () => {
  it("writes winter and summer time in Amsterdam with their offsets", () => {
    expect(localIso(new Date("2026-11-21T18:26:11.000Z"), "Europe/Amsterdam")).toBe("2026-11-21T19:26:11+01:00")
    expect(localIso(new Date("2026-07-01T12:00:00.000Z"), "Europe/Amsterdam")).toBe("2026-07-01T14:00:00+02:00")
  })

  it("crosses the day and writes negative and half-hour offsets", () => {
    expect(localIso(new Date("2026-11-21T02:30:00.000Z"), "America/New_York")).toBe("2026-11-20T21:30:00-05:00")
    expect(localIso(new Date("2026-11-21T00:00:00.000Z"), "Asia/Kolkata")).toBe("2026-11-21T05:30:00+05:30")
    expect(localIso(new Date("2026-11-21T00:00:00.000Z"), "UTC")).toBe("2026-11-21T00:00:00+00:00")
  })

  it("drops the milliseconds without moving the second", () => {
    expect(localIso(new Date("2026-11-21T18:26:11.999Z"), "Europe/Amsterdam")).toBe("2026-11-21T19:26:11+01:00")
  })

  it("reads back as the same moment", () => {
    const at = new Date("2026-03-29T01:30:00.000Z")
    expect(new Date(localIso(at, "Europe/Amsterdam")).getTime()).toBe(at.getTime())
  })
})
