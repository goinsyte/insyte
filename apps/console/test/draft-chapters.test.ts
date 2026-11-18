import { describe, expect, it } from "vitest"
import { chaptersOf } from "../src/ai/draft-chapters.ts"

/*
 * The inbox's draft card names the Kennisbank chapter the draft answers from, as the customer agent's test chat does
 * ("Uit Kennisbank: …"), linked to the chapter's page.
 */
describe("the chapters on a reply draft", () => {
  it("links each chapter the draft cited, once", () => {
    const sources = [
      { articleId: "kba_1", version: 2, title: "Retourneren" },
      { articleId: "kba_1", version: 2, title: "Retourneren" },
      { articleId: "kba_2", version: 1, title: "Verzending" }
    ]
    expect(chaptersOf({ sources })).toEqual([
      { title: "Retourneren", to: "/settings/ai/knowledge/kba_1" },
      { title: "Verzending", to: "/settings/ai/knowledge/kba_2" }
    ])
  })

  it("shows none for a draft that cited nothing, or no draft", () => {
    expect(chaptersOf({ sources: [] })).toBeUndefined()
    expect(chaptersOf({})).toBeUndefined()
    expect(chaptersOf(null)).toBeUndefined()
  })
})
