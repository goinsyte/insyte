import { describe, expect, it } from "vitest"
import { customerDraftText } from "../src/forwarding/domain/CustomerDraft.ts"
import { paragraphsOf, trackingText } from "../src/orders/domain/CustomerMail.ts"
import { statusText } from "../src/tickets/domain/CustomerMail.ts"

/*
 * The words Insyte writes for a shopper (M7 9.1, M8 10.2a, M11): in the store's name, with the shopper's first name,
 * and nothing Insyte does not know (no date, no amount).
 */

describe("the team's words as paragraphs", () => {
  it("splits on blank lines, trims each and drops the empty ones", () => {
    expect(paragraphsOf("Hoi Anna,\r\n\r\n  Hij is onderweg.  \n\n\n\nGroet,\nNorthwind\n")).toEqual([
      "Hoi Anna,",
      "Hij is onderweg.",
      "Groet,\nNorthwind"
    ])
    expect(paragraphsOf(" \n \n ")).toEqual([])
  })
})

describe("the track-and-trace update", () => {
  it("greets by first name and names the carrier where there is one", () => {
    const text = trackingText({ shop: "Northwind", customer: "Anna de Vries", number: "#1003", carrier: "PostNL" })
    expect(text.subject).toBe("Je bestelling #1003 is onderweg")
    expect(text.paragraphs[0]).toBe("Hallo Anna,")
    expect(text.paragraphs[1]).toBe("Je bestelling #1003 bij Northwind is onderweg met PostNL.")
    const plain = trackingText({ shop: "Northwind", customer: " ", number: "#1003", carrier: null })
    expect(plain.paragraphs.slice(0, 2)).toEqual(["Hallo,", "Je bestelling #1003 bij Northwind is onderweg."])
  })
})

describe("forwarding's draft for the shopper", () => {
  const facts = { customer: "Anna de Vries", number: "#1001", shop: "Northwind", line: { title: "Trui", variant: "M" } }

  it("asks for the address, offers to wait or refund for stock, and says it takes longer otherwise", () => {
    const address = customerDraftText({ ...facts, errorKind: "address" })
    expect(address.subject).toBe("Over je bestelling #1001")
    expect(address.body).toMatch(/^Hoi Anna,\n\nBedankt voor je bestelling #1001\. Om hem te kunnen versturen/)
    expect(address.body.endsWith("Groet,\nNorthwind")).toBe(true)
    expect(customerDraftText({ ...facts, errorKind: "stock" }).body).toContain("Trui (M) is bij onze leverancier")
    expect(customerDraftText({ ...facts, errorKind: "stock", line: null }).body).toContain("Een artikel is bij")
    for (const kind of ["no_supplier", "rejected", "send_failed", "supplier_paused", null] as const) {
      expect(customerDraftText({ ...facts, errorKind: kind }).body).toContain("duurt helaas langer")
    }
  })

  it("promises no date and no amount", () => {
    for (const kind of ["address", "stock", null] as const) {
      expect(customerDraftText({ ...facts, errorKind: kind }).body).not.toMatch(/\d+ (dagen|weken)|€/)
    }
  })
})

describe("a ticket's stand van zaken", () => {
  it("names the order where the ticket is about one, and the question otherwise", () => {
    expect(statusText({ customer: "Bram Jansen", about: "#1003" })).toMatchObject({
      subject: "Een update over je bestelling #1003"
    })
    expect(statusText({ customer: "Bram Jansen", about: "#1003" }).body).toMatch(/^Hoi Bram,\n\n/)
    expect(statusText({ customer: null, about: null })).toMatchObject({ subject: "Een update over je vraag" })
    expect(statusText({ customer: null, about: null }).body).toMatch(/^Hoi,\n\nEen korte update over je vraag/)
  })
})
