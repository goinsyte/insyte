import { describe, expect, it } from "vitest"

// Loaded the way `field.test.ts` loads components: their own imports are written for the bundler.
const sonner = "../src/components/sonner.tsx"
const search = "../src/app/inbox/inbox-search.ts"
const { toastClearance } = (await import(/* @vite-ignore */ sonner)) as {
  toastClearance: (boxes: Iterable<{ top: number; bottom: number; height: number }>, windowHeight: number) => number
}
const { inboxSearch } = (await import(/* @vite-ignore */ search)) as {
  inboxSearch: { parse: (s: unknown) => Record<string, unknown> }
}

const box = (top: number, bottom: number) => ({ top, bottom, height: bottom - top })

/*
 * Toasts used to sit at the foot of the window whatever was there, so "Jij hebt het gesprek overgenomen" lay on the
 * reply field being typed in, and a save's toast on the unsaved bar. They rise above what is pinned at the foot, and
 * only while it is on screen.
 */
describe("toastClearance", () => {
  it("is nothing with no bar on screen", () => {
    expect(toastClearance([], 900)).toBe(0)
  })

  it("is the reach of a composer at the foot of the window", () => {
    expect(toastClearance([box(780, 900)], 900)).toBe(120)
  })

  it("counts the gap under a floating bar, and takes the highest of several", () => {
    expect(toastClearance([box(836, 884), box(780, 900)], 900)).toBe(120)
    expect(toastClearance([box(836, 884)], 900)).toBe(64)
  })

  it("leaves out a bar that is hidden or scrolled out of the window", () => {
    expect(toastClearance([{ top: 0, bottom: 0, height: 0 }], 900)).toBe(0)
    expect(toastClearance([box(950, 1000)], 900)).toBe(0)
    expect(toastClearance([box(-300, -10)], 900)).toBe(0)
  })

  it("never sends the toasts past the middle of the window", () => {
    expect(toastClearance([box(100, 900)], 900)).toBe(450)
  })
})

describe("the inbox's address", () => {
  it("does not carry a customer's email address: E-mailen passes it on the history entry", () => {
    expect(inboxSearch.parse({ compose: "klant@voorbeeld.nl" })).toEqual({})
  })
})
