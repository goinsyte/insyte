import { describe, expect, it } from "vitest"
import { midSentence } from "../src/Sentence.ts"

describe("midSentence", () => {
  it.each([
    ["Onderweg met PostNL", "onderweg met PostNL"],
    ["Onderweg met {vervoerder}", "onderweg met {vervoerder}"],
    ["Bezorgd", "bezorgd"],
    ["In het land van bestemming", "in het land van bestemming"],
    ["Ligt klaar bij een DHL-punt", "ligt klaar bij een DHL-punt"]
  ])("lowers only the first letter of %s", (phrase, said) => {
    expect(midSentence(phrase)).toBe(said)
  })

  it.each(["{vervoerder} heeft je pakket", "PostNL heeft je pakket", "DHL", "GLS bezorgt vandaag", "onderweg", ""])(
    "keeps %s as it is",
    (phrase) => {
      expect(midSentence(phrase)).toBe(phrase)
    }
  )

  it("keeps a carrier with one capital that opens the phrase, decided on the template or on the carrier's name", () => {
    expect(midSentence("{vervoerder} heeft je pakket").replace("{vervoerder}", "Budbee")).toBe("Budbee heeft je pakket")
    expect(midSentence("Budbee heeft je pakket", "Budbee")).toBe("Budbee heeft je pakket")
    expect(midSentence("Bezorgd door Budbee", "Budbee")).toBe("bezorgd door Budbee")
    expect(midSentence("Budbee heeft je pakket")).toBe("budbee heeft je pakket")
  })
})
