import { describe, expect, it } from "vitest"
import { midSentence } from "../src/Sentence.ts"

describe("midSentence", () => {
  it.each([
    ["Onderweg met PostNL", "onderweg met PostNL"],
    ["Bezorgd", "bezorgd"],
    ["In het land van bestemming", "in het land van bestemming"],
    ["Ligt klaar bij een DHL-punt", "ligt klaar bij een DHL-punt"]
  ])("lowers only the first letter of %s", (phrase, said) => {
    expect(midSentence(phrase)).toBe(said)
  })

  it.each(["PostNL heeft je pakket", "DHL", "GLS bezorgt vandaag", "17TRACK meldt", "onderweg", ""])(
    "keeps %s as it is",
    (phrase) => {
      expect(midSentence(phrase)).toBe(phrase)
    }
  )
})
