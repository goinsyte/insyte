import { describe, expect, it } from "vitest"
import type { SetupFacts } from "../src/first-analysis/domain/FirstAnalysis.ts"
import { historyOf, predictionsOf, promisesIn, titlesOf, watchOf } from "../src/first-analysis/domain/Rules.ts"

/*
 * The early read's rules (M6.5): each prediction stands on a fact that is there, and nothing else. A store with no
 * facts gets no predictions, never a guess.
 */

const NONE: SetupFacts = {
  shipsTo: null,
  policies: null,
  promises: [],
  gateways: [],
  orders: 0,
  products: 0,
  customers: 0,
  days: 0,
  delivered: 0,
  refundReasons: 0
}

describe("the first analysis's rules", () => {
  it("reads delivery times from product pages and policies, in days", () => {
    expect(promisesIn("<p>Levertijd: 7 tot 12 werkdagen.</p>", "product")).toEqual([
      { min: 7, max: 12, working: true, source: "product" }
    ])
    expect(promisesIn("Ships in 3-5 days", "policy")).toEqual([{ min: 3, max: 5, working: false, source: "policy" }])
    expect(promisesIn("Binnen 2 werkdagen in huis", "product")).toEqual([
      { min: 2, max: 2, working: true, source: "product" }
    ])
    expect(promisesIn("<p>Zacht katoen, wasbaar op 30 graden.</p>", "product")).toEqual([])
  })

  it("says nothing it has no fact for", () => {
    expect(predictionsOf(NONE)).toEqual([])
  })

  it("predicts status questions from a delivery time over a week, and prepares the update", () => {
    const [long] = predictionsOf({ ...NONE, promises: [{ min: 7, max: 12, working: true, source: "product" }] })
    expect(long).toMatchObject({ read: "7 tot 12 werkdagen levertijd", prepares: "automation" })
    expect(predictionsOf({ ...NONE, promises: [{ min: 2, max: 4, working: true, source: "product" }] })).toEqual([])
  })

  it("names Klarna, a refund policy without a damage rule, and many countries", () => {
    const reads = predictionsOf({
      ...NONE,
      gateways: ["shopify_payments", "Klarna Pay Later"],
      policies: { shipping: null, refund: "<p>Retourneren binnen 30 dagen.</p>" },
      shipsTo: ["NL", "BE", "DE", "FR", "ES"]
    }).map((p) => p.read)
    expect(reads).toEqual([
      "Klarna als betaalmethode",
      "Retourbeleid zonder regel voor beschadigde artikelen",
      "Verzending naar 5 landen"
    ])
    expect(
      predictionsOf({ ...NONE, policies: { shipping: null, refund: "Beschadigd geleverd? Je krijgt je geld terug." } })
    ).toEqual([])
    expect(predictionsOf({ ...NONE, policies: { shipping: null, refund: null } }).map((p) => p.read)).toEqual([
      "Geen retourbeleid ingesteld"
    ])
  })

  it("keeps at most three, the most telling first", () => {
    const all = predictionsOf({
      ...NONE,
      promises: [{ min: 8, max: 14, working: false, source: "policy" }],
      gateways: ["klarna"],
      policies: { shipping: null, refund: null },
      shipsTo: ["NL", "BE", "DE", "FR", "AT", "LU"]
    })
    expect(all.map((p) => p.read)).toEqual([
      "8 tot 14 dagen levertijd",
      "Klarna als betaalmethode",
      "Geen retourbeleid ingesteld"
    ])
  })

  it("watches with the store's own counts, and knows when the history would be enough", () => {
    expect(watchOf({ ...NONE, delivered: 6, refundReasons: 2 })).toEqual([
      { label: "Levertijd per land", reveals: "dan zie je waar je belofte niet klopt", have: 6, need: 30 },
      { label: "Retourredenen", reveals: "dan zie je welk product terugkomt en waarom", have: 2, need: 10 }
    ])
    expect(historyOf({ ...NONE, orders: 14, days: 19 })).toBe("young")
    expect(historyOf({ ...NONE, orders: 3406, days: 90 })).toBe("enough")
  })

  it("titles the update two days before the shortest promise ends", () => {
    expect(titlesOf({ ...NONE, promises: [{ min: 7, max: 12, working: true, source: "product" }] }).automation.title)
      .toBe("Levertijd-update op dag 5")
    expect(titlesOf(NONE).automation.title).toBe("Levertijd-update op dag 5")
  })
})
