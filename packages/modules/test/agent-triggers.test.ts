import { describe, expect, it } from "vitest"
import {
  asksWhereOrderIs,
  heldForTeam,
  isOpenAt,
  promisesMoney,
  systemSender,
  untracedLinks
} from "../src/agent/domain/Triggers.ts"
import { automatedMail } from "../src/inbox/domain/Inbox.ts"

/*
 * What starts the agent by itself (M15 step 6): a mail that asks where an order is and nothing else, from a person; a
 * reply it may send without a person; and the offline plan's opening hours, in which the team answers what the plan
 * gave to the agent.
 */

const AMS = "Europe/Amsterdam"
// Monday to Friday 09:00–17:00, the weekend closed.
const office = [
  ...Array.from({ length: 5 }, () => ({ open: true, from: "09:00", to: "17:00" })),
  { open: false, from: "09:00", to: "17:00" },
  { open: false, from: "09:00", to: "17:00" }
]
const AGREED = Date.parse("2026-11-01T12:00:00Z")
const plan = (version: number | null) => ({
  window: "evening" as const,
  levels: { SendReply: "auto" as const },
  hours: office,
  version,
  at: AGREED
})
// Tuesday 10 November 2026: 10:00 and 20:00 in Amsterdam (09:00 and 19:00 UTC); Saturday 14 November, 10:00.
const tuesdayMorning = new Date("2026-11-10T09:00:00Z")
const tuesdayEvening = new Date("2026-11-10T19:00:00Z")
const saturday = new Date("2026-11-14T09:00:00Z")

const asks = (subject: string, text: string, reply = false) => asksWhereOrderIs({ subject, text, reply })

describe("a mail the agent answers", () => {
  it("asks where an order is, that it has not come, when it comes, or for its tracking", () => {
    expect(asks("Waar is mijn pakket?", "Hoi")).toBe(true)
    expect(asks("Vraag", "Mijn bestelling is nog niet ontvangen")).toBe(true)
    expect(asks("Vraag", "Mijn pakket is er nog steeds niet")).toBe(true)
    expect(asks("Vraag", "Wanneer komt mijn bestelling?")).toBe(true)
    expect(asks("Vraag", "Kun je de trackingcode sturen?")).toBe(true)
    expect(asks("Order", "Where is my order?")).toBe(true)
  })

  it("is not every mail that names an order", () => {
    expect(asks("Mijn bestelling", "Valt de jas klein?")).toBe(false)
    expect(asks("Vraag over mijn bestelling", "Is de kleur blauw of groen?")).toBe(false)
    expect(asks("Bestelling #1042", "Bedankt, alles is goed aangekomen.")).toBe(false)
    expect(asks("Pakket", "Is dit pakket groot genoeg voor een jas?")).toBe(false)
  })

  it("leaves a where-is-it that is also about damage, a cancellation, an address, a return or a complaint", () => {
    for (
      const text of [
        "Waar is mijn pakket? Het vorige kwam kapot aan.",
        "Waar is mijn bestelling? Ik wil hem annuleren.",
        "Waar is mijn pakket? Kan het naar een ander adres?",
        "Waar blijft mijn retour?",
        "Waar is mijn bestelling, ik heb een klacht.",
        "Waar blijft mijn geld terug?",
        "Where is my order? I want to cancel it."
      ]
    ) {
      expect(asks("Vraag", text)).toBe(false)
    }
  })

  it("reads a reply by its own words, not the thread's subject", () => {
    expect(asks("Re: Waar is mijn pakket?", "Bedankt!", true)).toBe(false)
    expect(asks("Re: Waar is mijn pakket?", "Nog steeds niet ontvangen", true)).toBe(true)
  })

  it("comes from a person, never a system: by its local part or a machine's domain", () => {
    for (
      const s of [
        "noreply@shop.nl",
        "no-reply@postnl.nl",
        "mailer-daemon@mx.nl",
        "bounce+x@mail.nl",
        "notifications@winkel.nl",
        "track@mail.postnl.nl",
        "info@dhlparcel.nl",
        "orders@shopify.com",
        "service@paypal.nl",
        "geen-at-teken"
      ]
    ) {
      expect(systemSender(s)).toBe(true)
    }
    expect(systemSender("sanne@voorbeeld.nl")).toBe(false)
    expect(systemSender("noreen@voorbeeld.nl")).toBe(false)
    expect(systemSender("info@postnl-fan.nl")).toBe(false)
  })

  it("is not a machine's, by its headers", () => {
    const h = (key: string, value: string) => [{ key, value }]
    expect(automatedMail(h("auto-submitted", "auto-replied"))).toBe(true)
    expect(automatedMail(h("Auto-Submitted", "auto-generated"))).toBe(true)
    expect(automatedMail(h("auto-submitted", "no"))).toBe(false)
    expect(automatedMail(h("precedence", "bulk"))).toBe(true)
    expect(automatedMail(h("precedence", "list"))).toBe(true)
    expect(automatedMail(h("precedence", "junk"))).toBe(true)
    expect(automatedMail(h("list-id", "<klanten.voorbeeld.nl>"))).toBe(true)
    expect(automatedMail(h("x-autoreply", "yes"))).toBe(true)
    expect(automatedMail(h("x-autorespond", "yes"))).toBe(true)
    expect(automatedMail(h("return-path", "<>"))).toBe(true)
    expect(automatedMail(h("return-path", "<sanne@voorbeeld.nl>"))).toBe(false)
    expect(automatedMail([])).toBe(false)
  })
})

describe("a reply the agent may send without a person", () => {
  it("promises no money, credit, cancellation or new parcel, across line breaks", () => {
    expect(promisesMoney("Je bestelling #1042 is onderweg met PostNL.")).toBe(false)
    expect(promisesMoney("We laten je weten wat de volgende stap is.")).toBe(false)
    for (
      const t of [
        "Je krijgt je geld terug",
        "Je krijgt je geld\nterug",
        "We storten het bedrag terug",
        "We gaan het terugstorten",
        "Je ontvangt een restitutie",
        "We crediteren je factuur",
        "Je krijgt een waardebon",
        "Hier is een cadeaubon",
        "Gebruik deze voucher",
        "We geven je 10% korting",
        "We vergoeden de verzendkosten",
        "Het nieuwe exemplaar is kosteloos",
        "We annuleren je bestelling",
        "We sturen je een nieuw pakket",
        "We versturen het opnieuw"
      ]
    ) {
      expect(promisesMoney(t), t).toBe(true)
    }
  })

  it("states no link or address it was not given", () => {
    const given = JSON.stringify({ brand: "Noordkust", orders: [{ tracking: "https://track.example/3S123" }] })
    expect(untracedLinks("Volg hem op https://track.example/3S123.", given)).toEqual([])
    expect(untracedLinks("Kijk op https://evil.example/x of mail hulp@evil.example", given)).toEqual([
      "https://evil.example/x",
      "hulp@evil.example"
    ])
    expect(untracedLinks("Ga naar www.evil.example", given)).toEqual(["www.evil.example"])
    expect(untracedLinks("Groet,\nNoordkust", given)).toEqual([])
  })
})

describe("the offline plan's hours", () => {
  it("are open on a weekday's office hours, in the workspace's time zone", () => {
    expect(isOpenAt(office, AMS, tuesdayMorning)).toBe(true)
    expect(isOpenAt(office, AMS, tuesdayEvening)).toBe(false)
    expect(isOpenAt(office, AMS, saturday)).toBe(false)
    // 08:30 UTC is 09:30 in Amsterdam, 03:30 in New York.
    expect(isOpenAt(office, "America/New_York", new Date("2026-11-10T08:30:00Z"))).toBe(false)
  })

  it("keep what the plan gave the agent for the team while it is online, and give it back after", () => {
    const own = { version: 3, at: AGREED }
    expect(heldForTeam(plan(3), "SendReply", own, AMS, tuesdayMorning)).toBe(true)
    expect(heldForTeam(plan(3), "SendReply", own, AMS, tuesdayEvening)).toBe(false)
    expect(heldForTeam(plan(3), "SendReply", own, AMS, saturday)).toBe(false)
  })

  it("leave a level set on Zelfstandigheid after the plan, by version or, without one, by when", () => {
    expect(heldForTeam(plan(3), "SendReply", { version: 4, at: AGREED + 1 }, AMS, tuesdayMorning)).toBe(false)
    expect(heldForTeam(plan(null), "SendReply", { version: 9, at: AGREED - 60_000 }, AMS, tuesdayMorning)).toBe(true)
    expect(heldForTeam(plan(null), "SendReply", { version: 9, at: AGREED + 60_000 }, AMS, tuesdayMorning)).toBe(false)
  })

  it("leave an action the plan does not name, and everything without a plan", () => {
    expect(heldForTeam(plan(3), "AddNote", null, AMS, tuesdayMorning)).toBe(false)
    expect(heldForTeam(null, "SendReply", null, AMS, tuesdayMorning)).toBe(false)
    expect(heldForTeam(plan(3), "SendReply", null, AMS, tuesdayMorning)).toBe(true)
  })
})
