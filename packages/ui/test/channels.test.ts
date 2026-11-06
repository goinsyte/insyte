import { describe, expect, it } from "vitest"
import { fillTemplate, lastInbound, mayReply, replyWindow } from "../src/app/lib/channels.ts"

const NOW = Date.parse("2026-11-01T12:00:00Z")
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString()

describe("the 24-hour reply window", () => {
  it("is open for 24 hours after the customer's last message, and counts down", () => {
    const w = replyWindow("whatsapp", h(18), NOW)
    expect(w.open).toBe(true)
    expect(w.hoursLeft).toBe(6)
  })

  it("closes after 24 hours: WhatsApp then takes only a template, Instagram nothing", () => {
    const w = replyWindow("whatsapp", h(30), NOW)
    expect(w.open).toBe(false)
    expect(mayReply("whatsapp", w)).toBe("template")
    expect(mayReply("instagram", replyWindow("instagram", h(30), NOW))).toBe("none")
  })

  it("does not apply to the website chat or email", () => {
    expect(replyWindow("webchat", h(300), NOW).applies).toBe(false)
    expect(mayReply("email", replyWindow("email", undefined, NOW))).toBe("free")
  })

  it("reads the customer's last message, not the business's", () => {
    expect(lastInbound([
      { from: "customer", at: h(30) },
      { from: "team", at: h(2) }
    ])).toBe(h(30))
  })

  it("fills a template's fields", () => {
    expect(fillTemplate("Hoi {{naam}}, nieuws over {{order}}.", { naam: "Felix", order: "SO-12208" })).toBe(
      "Hoi Felix, nieuws over SO-12208."
    )
  })
})
