import { describe, expect, it } from "vitest"
import { type CustomerAgentSettings, isOpen, move, nextOpenLabel } from "../src/app/lib/customer-agent.ts"

const weekdays = { open: true, from: "09:00", to: "18:00" }
const closed = { open: false, from: "09:00", to: "18:00" }
const s: CustomerAgentSettings = {
  on: true,
  channels: { webchat: "auto", whatsapp: "drafts", instagram: "off", email: "drafts" },
  hours: [weekdays, weekdays, weekdays, weekdays, weekdays, closed, closed],
  outside: "take",
  handover: { unsure: true, asksPerson: true, topics: ["chargebacks"], afterMessages: 8 },
  tone: "brand",
  handoverMessage: ""
}
// Wednesday 4 November 2026, local time.
const wed = (h: number, m = 0) => new Date(2026, 10, 4, h, m)

describe("opening hours", () => {
  it("is open inside the day's hours and closed outside them and at the weekend", () => {
    expect(isOpen(s.hours, wed(10))).toBe(true)
    expect(isOpen(s.hours, wed(18))).toBe(false)
    expect(isOpen(s.hours, new Date(2026, 10, 7, 12))).toBe(false)
  })

  it("says when a person is next there", () => {
    expect(nextOpenLabel(s.hours, wed(7, 30))).toBe("vandaag vanaf 9:00")
    expect(nextOpenLabel(s.hours, wed(19))).toBe("morgen vanaf 9:00")
    expect(nextOpenLabel(s.hours, new Date(2026, 10, 6, 19))).toBe("maandag vanaf 9:00")
  })
})

describe("what the agent does with a message", () => {
  it("answers on the website chat in hours, drafts on WhatsApp, stays out of Instagram", () => {
    expect(move(s, "webchat", wed(10))).toBe("answer")
    expect(move(s, "whatsapp", wed(10))).toBe("draft")
    expect(move(s, "instagram", wed(10))).toBe("silent")
  })

  it("hands over outside hours when set to take the question, and answers when set to answer", () => {
    expect(move(s, "webchat", wed(20))).toBe("handover")
    expect(move({ ...s, outside: "answer" }, "webchat", wed(20))).toBe("answer")
  })

  it("hands over when asked for a person, on an always-a-person topic, or once the budget is spent", () => {
    expect(move(s, "webchat", wed(10), { asksPerson: true })).toBe("handover")
    expect(move(s, "webchat", wed(10), { topic: "chargebacks" })).toBe("handover")
    expect(move(s, "webchat", wed(10), { budgetSpent: true })).toBe("handover")
  })

  it("does nothing while switched off", () => {
    expect(move({ ...s, on: false }, "webchat", wed(10))).toBe("silent")
  })
})
