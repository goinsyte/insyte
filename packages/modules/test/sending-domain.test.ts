import { describe, expect, it } from "vitest"
import { checkSenders } from "../src/settings/domain/Check.ts"
import { domainOfWebsite } from "../src/settings/domain/SendingDomain.ts"
import { sendersFor } from "../src/shared/domain/Senders.ts"

/*
 * E-mail en domein's rules (M17 step 20.1c): the domain a website names, which senders are kept, and who a shopper's
 * mail comes from: the brand's address once its domain is verified, Insyte's before, and never for a team mail.
 */

const stored = (verified: boolean, from = "service@northwind.store", replyTo = "support@northwind.store") => ({
  from,
  replyTo,
  domain: { name: "northwind.store", providerId: "d_1", verified, records: [], checkedAt: null, checks: 0 }
})

describe("the sending domain", () => {
  it("is the website's host without www, and none for no website or a platform address", () => {
    expect(domainOfWebsite("https://www.Northwind.store/shop")).toBe("northwind.store")
    expect(domainOfWebsite("https://shop.northwind.store")).toBe("shop.northwind.store")
    expect(domainOfWebsite("")).toBeNull()
    expect(domainOfWebsite("https://northwind.myshopify.com")).toBeNull()
    expect(domainOfWebsite("https://localhost")).toBeNull()
  })

  it("keeps a sender on the domain and an answer address that is a connected mailbox", () => {
    const mailboxes = ["support@northwind.store"]
    expect(
      checkSenders(
        { from: " Service@Northwind.store ", replyTo: "SUPPORT@northwind.store" },
        "northwind.store",
        mailboxes
      )
    ).toEqual({ ok: { from: "service@northwind.store", replyTo: "support@northwind.store" } })
    expect(checkSenders({ from: "", replyTo: "" }, null, [])).toEqual({ ok: { from: "", replyTo: "" } })
    expect(checkSenders({ from: "info@elders.nl", replyTo: "" }, "northwind.store", mailboxes)).toEqual({
      fields: { from: "not_on_domain" }
    })
    expect(checkSenders({ from: "info@northwind.store", replyTo: "" }, null, mailboxes)).toEqual({
      fields: { from: "no_domain" }
    })
    expect(checkSenders({ from: "geen adres", replyTo: "hallo@elders.nl" }, "northwind.store", mailboxes)).toEqual({
      fields: { from: "format", replyTo: "not_a_mailbox" }
    })
  })

  it("sends a shopper's mail from the brand once its domain is verified, and Insyte's before", () => {
    expect(sendersFor(undefined, "return.approved")).toEqual({})
    expect(sendersFor(stored(false), "return.approved")).toEqual({ replyTo: "support@northwind.store" })
    expect(sendersFor(stored(true), "order.delayed")).toEqual({
      from: "service@northwind.store",
      replyTo: "support@northwind.store"
    })
    // Not on the domain (saved before the domain changed): Insyte's sender stays.
    expect(sendersFor(stored(true, "service@elders.nl"), "return.label")).toEqual({
      replyTo: "support@northwind.store"
    })
  })

  it("answers the inbox's messages to their mailbox, and leaves team and account mail Insyte's", () => {
    expect(sendersFor(stored(true), "support.message")).toEqual({ from: "service@northwind.store" })
    expect(sendersFor(stored(true), "team.invite")).toEqual({})
    expect(sendersFor(stored(true), "auth.reset")).toEqual({})
    expect(sendersFor(stored(true), "member.notification")).toEqual({})
  })
})
