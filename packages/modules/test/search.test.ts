import { describe, expect, it } from "vitest"
import { excerptOf, likePattern, prefixPattern } from "../src/shared/domain/Search.ts"

/*
 * The search's text helpers (M11 step 6): patterns with the `ilike` wildcards escaped, and the words around a chat
 * message's match, on one line, without opening mid-word.
 */

describe("search text", () => {
  it("escapes what ilike would read as a wildcard", () => {
    expect(likePattern("  50%_off\\ ")).toBe("%50\\%\\_off\\\\%")
    expect(prefixPattern("#12")).toBe("#12%")
  })

  it("keeps a short message whole, on one line", () => {
    expect(excerptOf("Pakket\n\nnaar  Zeeland", "zeeland")).toBe("Pakket naar Zeeland")
  })

  it("cuts a long message around the match, at a word", () => {
    const body = `${"woord ".repeat(40)}de zending naar Zeeland is vertraagd ${"en meer ".repeat(30)}`
    const excerpt = excerptOf(body, "zeeland", 60)
    expect(excerpt).toContain("Zeeland")
    expect(excerpt.startsWith("…woord") || excerpt.startsWith("…de")).toBe(true)
    expect(excerpt.endsWith("…")).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(62)
  })

  it("starts at the beginning when the match is there", () => {
    const excerpt = excerptOf(`Zeeland ${"x ".repeat(100)}`, "zeeland", 20)
    expect(excerpt.startsWith("Zeeland")).toBe(true)
  })
})
