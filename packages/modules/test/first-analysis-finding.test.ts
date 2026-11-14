import { describe, expect, it } from "vitest"
import { findingOf, mailFactsOf, slowestCountry, WINDOW_DAYS } from "../src/first-analysis/domain/Finding.ts"
import type { SetupFacts } from "../src/first-analysis/domain/FirstAnalysis.ts"
import { hoursFor, offlineActionsFor, offlineLevelsOf } from "../src/first-analysis/domain/Offline.ts"
import { deliverySheet, readsFor, updateDay } from "../src/first-analysis/domain/Rules.ts"

/*
 * The first analysis made real (M15 step 5): the finding stands only on counts Insyte read, and its effect is those
 * counts multiplied out (the reference's 71% of 412 is ~290); the sheet holds the store's own parcels; the offline
 * plan sets only the step's actions, and its window gives the customer agent's hours.
 */

const name = (code: string) => ({ US: "Verenigde Staten", DE: "Duitsland", NL: "Nederland" })[code] ?? code

const SETTLED: SetupFacts = {
  shipsTo: ["NL", "DE", "US"],
  policies: { shipping: null, refund: "Beschadigd? Mail ons." },
  promises: [{ min: 5, max: 7, working: false, source: "product" }],
  gateways: [],
  orders: 3406,
  products: 248,
  customers: 1912,
  days: 90,
  delivered: 2100,
  refundReasons: 40,
  mail: { window: 90, mails: 1288, status: 412, linked: 300, early: 213, dayLow: 6, dayHigh: 10 },
  countries: [
    { country: "NL", delivered: 1106, days: 4.2 },
    { country: "US", delivered: 238, days: 9.4 },
    { country: "DE", delivered: 12, days: 11 }
  ]
}

describe("the first analysis's finding", () => {
  it("names the status mail, the slow country and when the mail comes, each with its basis", () => {
    const finding = findingOf(SETTLED, name)
    expect(finding).toEqual({
      headline: "Bijna een derde van je klantmail is “waar is mijn bestelling?”.",
      evidence: [
        {
          figure: "412 van 1.288",
          says: "mails in 90 dagen gaan over de status van een bestelling",
          basis: "Inbox, laatste 90 dagen"
        },
        {
          figure: "9,4 dagen",
          says: "duurt een bestelling naar Verenigde Staten, je productpagina's beloven 5 tot 7 dagen",
          basis: "238 bezorgde zendingen naar Verenigde Staten"
        },
        {
          figure: "71%",
          says: "van die mails komt binnen op dag 6 tot 10, voordat het pakket er is",
          basis: "Moment van de mail naast de bezorgdatum"
        }
      ],
      fix: {
        title: "Laat de klant niet wachten tot hij gaat vragen.",
        why:
          "Stuur op dag 3 zelf de trackinglink en de verwachte datum. Dit is de vaste aanpak bij veel vragen over de status: de meeste van deze mails vragen niets anders."
      },
      effect: {
        figure: "~290 mails minder per kwartaal",
        basis: "71% van 412, als die klanten de update op tijd krijgen"
      }
    })
  })

  it("leaves the country out when none has enough parcels past the promise", () => {
    expect(slowestCountry(SETTLED.countries!, { min: 5, max: 12, working: false, source: "product" })).toBeUndefined()
    // Working days stretch over weekends: 9,4 days is within 7 working days.
    expect(slowestCountry(SETTLED.countries!, { min: 5, max: 7, working: true, source: "product" })).toBeUndefined()
    expect(slowestCountry(SETTLED.countries!, undefined)).toBeUndefined()
    const finding = findingOf({ ...SETTLED, promises: [] }, name)
    expect(finding?.evidence.map((e) => e.figure)).toEqual(["412 van 1.288", "71%"])
  })

  it("names nothing without the mail, the history, the share or orders to tie it to", () => {
    expect(findingOf({ ...SETTLED, mail: null }, name)).toBeNull()
    expect(findingOf({ ...SETTLED, mail: undefined }, name)).toBeNull()
    expect(findingOf({ ...SETTLED, orders: 40 }, name)).toBeNull()
    expect(findingOf({ ...SETTLED, mail: { ...SETTLED.mail!, mails: 30, status: 20 } }, name)).toBeNull()
    expect(findingOf({ ...SETTLED, mail: { ...SETTLED.mail!, status: 200 } }, name)).toBeNull()
    expect(findingOf({ ...SETTLED, mail: { ...SETTLED.mail!, linked: 9 } }, name)).toBeNull()
    expect(findingOf({ ...SETTLED, mail: { ...SETTLED.mail!, early: 0 } }, name)).toBeNull()
  })

  it("says the share no larger than it is", () => {
    const headline = (status: number) =>
      findingOf({ ...SETTLED, mail: { ...SETTLED.mail!, mails: 100, status } }, name)?.headline
    expect(headline(25)).toBe("Een kwart van je klantmail is “waar is mijn bestelling?”.")
    expect(headline(29)).toBe("Ruim een kwart van je klantmail is “waar is mijn bestelling?”.")
    expect(headline(30)).toBe("Bijna een derde van je klantmail is “waar is mijn bestelling?”.")
    expect(headline(34)).toBe("Een derde van je klantmail is “waar is mijn bestelling?”.")
    expect(headline(45)).toBe("Ruim een derde van je klantmail is “waar is mijn bestelling?”.")
    expect(headline(50)).toBe("De helft van je klantmail is “waar is mijn bestelling?”.")
    expect(headline(60)).toBe("Meer dan de helft van je klantmail is “waar is mijn bestelling?”.")
  })

  it("rounds a small effect to what it is, never up to five", () => {
    const small = findingOf(
      { ...SETTLED, mail: { window: 90, mails: 40, status: 10, linked: 10, early: 1, dayLow: 4, dayHigh: 4 } },
      name
    )
    expect(small?.effect.figure).toBe("~1 mail minder per kwartaal")
    const few = findingOf(
      { ...SETTLED, mail: { window: 90, mails: 40, status: 12, linked: 10, early: 6, dayLow: 4, dayHigh: 6 } },
      name
    )
    expect(few?.effect.figure).toBe("~7 mails minder per kwartaal")
  })
})

describe("the first analysis's inbox read", () => {
  const at = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000)
  const NOW = Date.UTC(2026, 10, 14, 12)

  it("keeps counts only: no sender, subject or text of a mail", () => {
    const firsts = [{ at: at(1), email: "klant@voorbeeld.nl", subject: "Waar is mijn pakket?", text: "Hoi" }]
    const facts = mailFactsOf(firsts, 1, { linked: 1, early: 1, dayLow: 3, dayHigh: 3 }, 5000, NOW)
    expect(Object.keys(facts).toSorted()).toEqual(
      ["dayHigh", "dayLow", "early", "linked", "mails", "status", "window"]
    )
    expect(Object.values(facts).every((v) => Number.isInteger(v))).toBe(true)
    expect(JSON.stringify(facts)).not.toMatch(/klant|pakket|Hoi/)
  })

  it("reads the window as the days the kept mail spans when the cap cuts it", () => {
    const three = [at(1), at(10), at(20.5)].map((d) => ({ at: d }))
    expect(mailFactsOf(three, 0, undefined, 5000, NOW).window).toBe(WINDOW_DAYS)
    expect(mailFactsOf(three, 0, undefined, 3, NOW)).toEqual({
      window: 21,
      mails: 3,
      status: 0,
      linked: 0,
      early: 0,
      dayLow: 0,
      dayHigh: 0
    })
  })
})

describe("the first analysis's sheet", () => {
  it("lists the counted countries first, then those shipped to without parcels, the difference a formula", () => {
    const tab = deliverySheet({ ...SETTLED, shipsTo: ["NL", "US", "BE"] }, name, "tab_1")
    expect(tab.name).toBe("Per land")
    expect(tab.cells["A2"]?.v).toBe("Nederland")
    expect(tab.cells["A1"]?.v).toBe("Land")
    expect(tab.cells["B1"]?.v).toBe("Belofte (dagen)")
    expect(tab.cells["B2"]).toEqual({ v: "7,0", fmt: "number" })
    expect(tab.cells["C2"]).toEqual({ v: "4,2", fmt: "number" })
    expect(tab.cells["D2"]).toEqual({ v: "=C2-B2", fmt: "number" })
    expect(tab.cells["E2"]).toEqual({ v: "1106", fmt: "integer" })
    expect(tab.cells["A5"]?.v).toBe("BE")
    expect(tab.cells["C5"]).toBeUndefined()
    expect(tab.cells["E5"]).toEqual({ v: "0", fmt: "integer" })
  })

  it("puts a promise in working days in calendar days, as the median is", () => {
    const tab = deliverySheet(
      { ...SETTLED, promises: [{ min: 5, max: 7, working: true, source: "policy" }] },
      name,
      "tab_1"
    )
    expect(tab.cells["B1"]?.v).toBe("Belofte (dagen, 7 werkdagen)")
    expect(tab.cells["B2"]).toEqual({ v: "9,8", fmt: "number" })
    expect(tab.cells["D2"]).toEqual({ v: "=C2-B2", fmt: "number" })
  })

  it("has no promise column values when the store promises nothing", () => {
    const tab = deliverySheet({ ...SETTLED, promises: [] }, name, "tab_1")
    expect(tab.cells["B2"]).toBeUndefined()
    expect(tab.cells["D2"]).toBeUndefined()
  })
})

describe("the first analysis's reads and update day", () => {
  it("reads the inbox only with a mailbox, after the orders", () => {
    expect(readsFor(false).map((r) => r.id)).toEqual(["orders", "products", "policies"])
    expect(readsFor(true).map((r) => r.id)).toEqual(["orders", "mail", "products", "policies"])
  })

  it("sends the update two days before the longest promise's shortest end, from day 2 to 10", () => {
    expect(updateDay({ ...SETTLED, promises: [] })).toBe(5)
    expect(updateDay({ ...SETTLED, promises: [{ min: 7, max: 12, working: true, source: "product" }] })).toBe(5)
    expect(updateDay({ ...SETTLED, promises: [{ min: 20, max: 30, working: false, source: "policy" }] })).toBe(10)
    expect(updateDay({ ...SETTLED, promises: [{ min: 1, max: 2, working: false, source: "policy" }] })).toBe(2)
  })
})

describe("the offline plan", () => {
  it("lists forwarding only when someone else ships", () => {
    expect(offlineActionsFor({ fulfilment: "one" })).toEqual([
      "ForwardOrder",
      "ApplyLabel",
      "SendReply",
      "ApproveReturn",
      "RefundOrder"
    ])
    expect(offlineActionsFor({ fulfilment: "self" })).not.toContain("ForwardOrder")
    expect(offlineActionsFor(null)).toContain("ForwardOrder")
  })

  it("keeps the step's own actions, drops forwarding for a store that ships itself, and names the rest", () => {
    expect(offlineLevelsOf({ ForwardOrder: "auto", SendReply: "ask" }, { fulfilment: "self" })).toEqual({
      levels: { SendReply: "ask" },
      unknown: []
    })
    expect(offlineLevelsOf({ AddNote: "auto", ApplyLabel: "auto" }, null)).toEqual({
      levels: { ApplyLabel: "auto" },
      unknown: ["AddNote"]
    })
  })

  it("opens the customer agent's hours when someone is online", () => {
    const evening = hoursFor("evening")
    expect(evening).toHaveLength(7)
    expect(evening.filter((d) => d.open)).toHaveLength(5)
    expect(evening[0]).toEqual({ open: true, from: "09:00", to: "18:00" })
    expect(hoursFor("late").filter((d) => d.open).map((d) => d.to)).toEqual(Array(6).fill("22:00"))
    expect(hoursFor("shifts").every((d) => d.open && d.to === "23:59")).toBe(true)
  })
})
