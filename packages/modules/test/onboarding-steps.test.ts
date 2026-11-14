import { describe, expect, it } from "vitest"
import { type Facts, next, positionOf, type Step, STEPS } from "../src/onboarding/domain/Steps.ts"

const none: Facts = { emailVerified: false, hasWorkspace: false, storeConnected: false, backfillDone: false }
const verified: Facts = { ...none, emailVerified: true }

const walk = (track: "supplier" | "affiliate") => {
  const seen: Array<Step> = []
  let step: Step = "role"
  for (let i = 0; i < 8; i++) seen.push(step = next(track, step, verified))
  return seen
}

describe("the onboarding machine", () => {
  it("opens every track with account, verify and role, and lets a verified person past them", () => {
    for (const track of ["admin", "supplier", "affiliate"] as const) {
      expect(STEPS[track].slice(0, 3)).toEqual(["account", "verify", "role"])
      expect(next(track, "account", none)).toBe("verify")
      expect(next(track, "verify", none)).toBe("verify")
      expect(next(track, "account", verified)).toBe("role")
      expect(next(track, "verify", verified)).toBe("role")
    }
  })

  it("walks the admin track, holding at the steps whose fact is not there yet", () => {
    expect(next("admin", "role", verified)).toBe("organization")
    expect(next("admin", "organization", verified)).toBe("organization")
    expect(next("admin", "organization", { ...verified, hasWorkspace: true })).toBe("plan")
    expect(next("admin", "plan", verified)).toBe("store")
    expect(next("admin", "store", verified)).toBe("ready") // skipped: "Nu overslaan"
    expect(next("admin", "store", { ...verified, storeConnected: true })).toBe("sync")
    expect(next("admin", "sync", verified)).toBe("sync")
    expect(next("admin", "sync", { ...verified, backfillDone: true })).toBe("analysis")
    expect(next("admin", "analysis", verified)).toBe("offline")
    expect(next("admin", "offline", verified)).toBe("ready")
    expect(next("admin", "ready", verified)).toBe("ready")
  })

  it("walks the partner tracks in their order, and ends on their last step", () => {
    expect(walk("supplier").slice(0, 4)).toEqual(["profile", "api", "stock", "ready"])
    expect(walk("affiliate").slice(0, 2)).toEqual(["profile", "review"])
    expect(walk("affiliate").at(-1)).toBe("review")
  })

  it("places a step in the console's list", () => {
    expect(positionOf("admin", "organization")).toEqual({ index: 3, total: 10 })
    expect(positionOf("supplier", "stock")).toEqual({ index: 5, total: 7 })
    expect(positionOf("affiliate", "role")).toEqual({ index: 2, total: 5 })
  })
})
