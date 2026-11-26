import { ThreadRow } from "@insyte/modules/inbox/domain/Inbox"
import { describe, expect, it } from "vitest"
import { reasonOf, threadOf } from "../src/inbox/thread-of.ts"

/*
 * The inbox's rows as the design reads them: a website chat named after where it was held, and the customer agent's
 * handover said in the band's words rather than as its code.
 */

const row = (over: Partial<ThreadRow> = {}) =>
  new ThreadRow({
    id: "thr_a",
    mailboxId: "chn_a",
    subject: "",
    participants: [{ name: "Websitebezoeker", email: "", team: false }],
    lastMessageAt: 0,
    preview: "Hoi",
    unread: true,
    starred: false,
    labels: [],
    assigneeId: null,
    ticketId: null,
    customerId: null,
    hasAttachments: false,
    hasInbound: true,
    archivedAt: null,
    snoozedUntil: null,
    spamAt: null,
    deletedAt: null,
    channel: null,
    storeId: null,
    agentState: null,
    takenOverBy: null,
    closedAt: null,
    orderNumber: null,
    ...over
  })

describe("an inbox row", () => {
  it("names a chat without a subject Websitechat, and a mail without one as before", () => {
    expect(threadOf(row({ channel: "webchat" }), 0).subject).toBe("Websitechat")
    expect(threadOf(row(), 0).subject).toBe("(geen onderwerp)")
    expect(threadOf(row({ channel: "webchat", subject: "Retour" }), 0).subject).toBe("Retour")
  })
})

describe("a handover's reason", () => {
  it("reads as the band says it, and a free note as it was written", () => {
    expect(reasonOf("asks_person")).toBe("de klant vraagt om een mens")
    expect(reasonOf("policy")).toBe("klant beantwoorden staat op Nooit")
    expect(reasonOf("unsure")).toBe("Insyte twijfelt aan het antwoord")
    expect(reasonOf("Klant wil bellen")).toBe("Klant wil bellen")
    expect(reasonOf("toString")).toBe("toString")
  })
})
