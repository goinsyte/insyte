import { describe, expect, it } from "vitest"
import { draftDirty, draftOnArrival, keptOrHeld } from "../src/app/lib/courses.ts"

const before = JSON.stringify({ title: "Retouren", updatedAt: "1" })
const typed = JSON.stringify({ title: "Retouren afhandelen", updatedAt: "1" })
const more = JSON.stringify({ title: "Retouren afhandelen, stap voor stap", updatedAt: "1" })
const host = JSON.stringify({ title: "Retouren afhandelen", updatedAt: "2" })

/*
 * The course editor after a save: the unsaved bar went only once the course was read again, so the save's toast lay on
 * a bar that was done. It now goes the moment the save lands; the course read again replaces the draft only where
 * nothing was typed in between, and a refused save keeps a held navigation held.
 */
describe("the course editor's draft", () => {
  it("holds no changes once a save lands, before the course comes back", () => {
    expect(draftDirty(typed, before, null)).toBe(true)
    expect(draftDirty(typed, before, typed)).toBe(false)
  })

  it("holds the changes typed after the save landed", () => {
    expect(draftDirty(more, before, typed)).toBe(true)
  })

  it("follows the course the host sends back when nothing was typed since the save", () => {
    expect(draftOnArrival(typed, typed, typed, host)).toBe(host)
  })

  it("keeps what was typed between the save and the course coming back", () => {
    expect(draftOnArrival(more, more, typed, host)).toBe(more)
    // Then the bar says so, against the host's course.
    expect(draftDirty(more, host, null)).toBe(true)
  })
})

// The unsaved bar's own order: a held navigation goes on only once the save has resolved.
const bar = async (save: () => Promise<void>) => {
  let went = false
  await save().then(() => (went = true), () => {})
  return went
}

describe("a save the unsaved bar waits on", () => {
  it("lets a held navigation go on once it was kept", async () => {
    expect(await bar(() => keptOrHeld(true))).toBe(true)
    expect(await bar(() => keptOrHeld(Promise.resolve(true)))).toBe(true)
  })

  it("keeps the navigation held when it was refused", async () => {
    expect(await bar(() => keptOrHeld(false))).toBe(false)
    expect(await bar(() => keptOrHeld(Promise.resolve(false)))).toBe(false)
  })
})
