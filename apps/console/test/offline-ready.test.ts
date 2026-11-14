import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import { offlineReady } from "../src/onboarding/offline-ready.ts"

/*
 * When the offline step's "Afronden" may make the plan (ADR-0027). After "Klaarzetten" the screen draws the step while
 * the server still has the person on the analysis step, and the policy may be read before or after that: the plan
 * waits for both, so it is never made on a version the server did not answer.
 */

const read = (version: number) => AsyncResult.success<{ readonly version: number }, unknown>({ version })
const reading = AsyncResult.initial<{ readonly version: number }, unknown>(true)
const failed = AsyncResult.fail<unknown, { readonly version: number }>("down")

describe("the offline step's plan", () => {
  it("waits while the server still has the person on the analysis step, even with the policy read", () => {
    expect(offlineReady({ serverStep: "analysis", policy: read(1), timedOut: false })).toEqual({ kind: "wait" })
  })

  it("waits while the policy is read, on the offline step", () => {
    expect(offlineReady({ serverStep: "offline", policy: reading, timedOut: false })).toEqual({ kind: "wait" })
    expect(offlineReady({ serverStep: undefined, policy: reading, timedOut: false })).toEqual({ kind: "wait" })
  })

  it("waits while a read policy is read again", () => {
    const again = AsyncResult.success<{ readonly version: number }, unknown>({ version: 3 }, { waiting: true })
    expect(offlineReady({ serverStep: "offline", policy: again, timedOut: false })).toEqual({ kind: "wait" })
  })

  it("makes the plan on the version the server answered, once both reads are in", () => {
    expect(offlineReady({ serverStep: "offline", policy: read(1), timedOut: false })).toEqual({
      kind: "ready",
      version: 1
    })
    expect(offlineReady({ serverStep: "offline", policy: read(4), timedOut: true })).toEqual({
      kind: "ready",
      version: 4
    })
  })

  it("says so when the policy could not be read", () => {
    expect(offlineReady({ serverStep: "offline", policy: failed, timedOut: false })).toEqual({ kind: "failed" })
    expect(offlineReady({ serverStep: "analysis", policy: failed, timedOut: false })).toEqual({ kind: "failed" })
  })

  it("stops waiting after the wait has run out", () => {
    expect(offlineReady({ serverStep: "analysis", policy: read(1), timedOut: true })).toEqual({ kind: "failed" })
    expect(offlineReady({ serverStep: "offline", policy: reading, timedOut: true })).toEqual({ kind: "failed" })
  })

  it("waits again while a failed read is read again", () => {
    const again = AsyncResult.fail<unknown, { readonly version: number }>("down", { waiting: true })
    expect(offlineReady({ serverStep: "offline", policy: again, timedOut: false })).toEqual({ kind: "wait" })
  })
})
