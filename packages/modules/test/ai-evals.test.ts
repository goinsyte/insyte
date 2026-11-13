import { describe, expect, it } from "vitest"
import { untracedFigures, voiceFaults } from "../src/ai/domain/Guards.ts"
import { CASES, grade } from "../src/ai/evals/Evals.ts"

/*
 * Insyte AI's evals against the fake (M15 step 1): every prompt's own deterministic answer passes every case, so the
 * stages without a model say nothing a model would be marked down for. The same cases run against the model with
 * `bun scripts/ai-evals.ts`.
 */

describe("the evals, on the fake", () => {
  for (const c of CASES) {
    it(c.name, () => {
      expect(grade(c, c.prompt.fake(c.input))).toEqual([])
    })
  }
})

describe("the guards", () => {
  it("finds a figure the input never had", () => {
    expect(untracedFigures("Je krijgt € 25,00 terug op 14 november.", "Bestelling #1042 van € 89,95, 3 november"))
      .toEqual(["25", "0", "14"])
    expect(untracedFigures("Bestelling 1042 kost 89,95.", "Bestelling #1042 van € 89,95")).toEqual([])
  })

  it("lints the voice", () => {
    expect(voiceFaults("Hoi Sanne, je pakket is onderweg.")).toEqual([])
    expect(voiceFaults("Sorry! Uw pakket is onderweg.")).toEqual(["exclamation", "formal", "apology"])
    expect(voiceFaults("  ")).toEqual(["empty"])
  })

  it("marks a made-up figure and a broken voice in a graded answer", () => {
    const reply = CASES[0]!
    expect(grade(reply, { text: "Hoi Sanne! Je krijgt 20% korting op bestelling #1042. Groet, Noordkust" }))
      .toEqual(["states 20, which the input does not have", "voice: exclamation", "says \"korting\""])
    expect(grade(reply, { answer: 1 })).toEqual(["does not fit the prompt's schema"])
  })
})
