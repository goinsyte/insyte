import { describe, expect, it } from "vitest"
import { withTexts } from "../src/ai/version-texts.ts"

/*
 * Kennisbank's Versies drawer: each version shows its own text, so a draft's diff against the version before it marks
 * what the draft changed.
 */

const at = "2026-11-21T10:00:00.000Z"
const known = [1, 2, 3].map((n) => ({ n, at, by: "Iemand", title: "Retourneren", body: "", published: n <= 2 }))

describe("the versions' texts", () => {
  it("gives every version its own text, by its number", () => {
    const read = [
      { version: 3, body: "Binnen 30 dagen.\nOok sale." },
      { version: 1, body: "Concept" },
      { version: 2, body: "Binnen 30 dagen." }
    ]
    expect(withTexts(known, read).map((v) => [v.n, v.body])).toEqual([
      [1, "Concept"],
      [2, "Binnen 30 dagen."],
      [3, "Binnen 30 dagen.\nOok sale."]
    ])
  })

  it("keeps what the chapter carried for a version the read lacks", () => {
    const carried = known.map((v) => (v.n === 2 ? { ...v, body: "Gepubliceerd" } : v))
    expect(withTexts(carried, [{ version: 3, body: "Nieuw" }]).map((v) => v.body)).toEqual([
      "",
      "Gepubliceerd",
      "Nieuw"
    ])
  })
})
