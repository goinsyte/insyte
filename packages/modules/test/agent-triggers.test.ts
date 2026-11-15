import { describe, expect, it } from "vitest"
import { asksWhereOrderIs, heldForTeam, isOpenAt, promisesMoney, SYSTEM_SENDER } from "../src/agent/domain/Triggers.ts"

/*
 * What starts the agent by itself (M15 step 6): a mail that asks where an order is, from a customer; a reply it may send
 * without a person; and the offline plan's opening hours, in which the team answers what the plan gave to the agent.
 */

const AMS = "Europe/Amsterdam"
// Monday to Friday 09:00–17:00, the weekend closed.
const office = [
  ...Array.from({ length: 5 }, () => ({ open: true, from: "09:00", to: "17:00" })),
  { open: false, from: "09:00", to: "17:00" },
  { open: false, from: "09:00", to: "17:00" }
]
const plan = (version: number | null) => ({
  window: "evening" as const,
  levels: { SendReply: "auto" as const },
  hours: office,
  version,
  at: 0
})
// Tuesday 10 November 2026: 10:00 and 20:00 in Amsterdam (09:00 and 19:00 UTC); Saturday 14 November, 10:00.
const tuesdayMorning = new Date("2026-11-10T09:00:00Z")
const tuesdayEvening = new Date("2026-11-10T19:00:00Z")
const saturday = new Date("2026-11-14T09:00:00Z")

describe("a mail the agent answers", () => {
  it("asks where an order is, by its subject or its words", () => {
    expect(asksWhereOrderIs({ subject: "Waar is mijn pakket?", text: "Hoi", reply: false })).toBe(true)
    expect(asksWhereOrderIs({ subject: "Vraag", text: "Mijn bestelling is nog niet bezorgd", reply: false }))
      .toBe(true)
    expect(asksWhereOrderIs({ subject: "Vraag over de maat", text: "Valt hij klein?", reply: false })).toBe(false)
    // A return asks something else, even about an order.
    expect(asksWhereOrderIs({ subject: "Retour bestelling", text: "Ik wil hem terugsturen", reply: false }))
      .toBe(false)
  })

  it("reads a reply by its own words, not the thread's subject", () => {
    expect(asksWhereOrderIs({ subject: "Re: Waar is mijn pakket?", text: "Bedankt!", reply: true })).toBe(false)
    expect(asksWhereOrderIs({ subject: "Re: Waar is mijn pakket?", text: "Nog steeds geen pakket", reply: true }))
      .toBe(true)
  })

  it("comes from a customer, never a system", () => {
    for (const s of ["noreply@shop.nl", "no-reply@postnl.nl", "mailer-daemon@mx.nl", "bounce+x@mail.nl"]) {
      expect(SYSTEM_SENDER.test(s)).toBe(true)
    }
    expect(SYSTEM_SENDER.test("sanne@voorbeeld.nl")).toBe(false)
    expect(SYSTEM_SENDER.test("noreen@voorbeeld.nl")).toBe(false)
  })

  it("goes alone only when it promises no money", () => {
    expect(promisesMoney("Je bestelling #1042 is onderweg.")).toBe(false)
    for (const t of ["Je krijgt je geld terug", "We geven je 10% korting", "We vergoeden de verzendkosten"]) {
      expect(promisesMoney(t)).toBe(true)
    }
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
    expect(heldForTeam(plan(3), "SendReply", 3, AMS, tuesdayMorning)).toBe(true)
    expect(heldForTeam(plan(3), "SendReply", 3, AMS, tuesdayEvening)).toBe(false)
    expect(heldForTeam(plan(3), "SendReply", 3, AMS, saturday)).toBe(false)
  })

  it("leave a level set on Zelfstandigheid after the plan, an action it does not name, and no plan at all", () => {
    expect(heldForTeam(plan(3), "SendReply", 4, AMS, tuesdayMorning)).toBe(false)
    expect(heldForTeam(plan(3), "AddNote", 3, AMS, tuesdayMorning)).toBe(false)
    expect(heldForTeam(null, "SendReply", null, AMS, tuesdayMorning)).toBe(false)
    expect(heldForTeam(plan(null), "SendReply", 9, AMS, tuesdayMorning)).toBe(true)
  })
})
