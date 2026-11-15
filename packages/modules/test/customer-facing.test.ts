import { describe, expect, it } from "vitest"
import {
  buttonColorOf,
  fillLinks,
  linksOf,
  logoFileOf,
  logoPath,
  parcelStatusOf,
  wordingFor
} from "../src/shared/domain/CustomerFacing.ts"

/*
 * What a shopper sees of the settings pages (M17 step 20.1b): Verzending's sentence for a parcel's status, Sjablonen'
 * links in the team's words (a sentence with an empty link taken out), and Huisstijl's colour only where white text
 * reads on it. A section never saved answers what a new workspace starts from.
 */

const LINKS = {
  review: "https://northwind.store/review",
  unsubscribe: "",
  restock: "https://northwind.store/terug"
}

describe("Verzending's wording", () => {
  it("reads a parcel's status as Shipping.statusCounts does: AfterShip's word first, Shopify's until then", () => {
    expect(parcelStatusOf("in_transit", "delivered")).toBe("transit")
    expect(parcelStatusOf("pending", "out_for_delivery")).toBe("out")
    expect(parcelStatusOf("pending", null)).toBe("noinfo")
    expect(parcelStatusOf(null, null)).toBe("info")
    expect(parcelStatusOf(null, "returned")).toBe("exception")
    expect(parcelStatusOf("expired", null)).toBe("stale")
    expect(parcelStatusOf("delivered", null)).toBe("delivered")
  })

  it("says the saved sentence with the carrier in, and the default where nothing is saved", () => {
    const saved = { statuses: [{ id: "local", label: "Bijna bij je, met {vervoerder}", show: "line" }] }
    expect(wordingFor(saved, "local", "DHL")).toEqual({ text: "Bijna bij je, met DHL", show: "line" })
    expect(wordingFor(undefined, "local", "PostNL")).toEqual({ text: "Onderweg met PostNL", show: "all" })
    expect(wordingFor(undefined, "local", null)).toEqual({ text: "Onderweg met de vervoerder", show: "all" })
    // A status the saved value lacks, or a row an older page wrote badly, reads as a new workspace's.
    expect(wordingFor(saved, "delivered", "DHL")).toEqual({ text: "Bezorgd", show: "all" })
    expect(wordingFor({ statuses: [{ id: "out", label: " ", show: "nowhere" }] }, "out", null)).toEqual({
      text: "Wordt vandaag bezorgd",
      show: "all"
    })
  })
})

describe("Sjablonen' links", () => {
  it("puts each link in for its variable, and takes a sentence with an empty link out", () => {
    const text = [
      "Hoi Lena,",
      "",
      "Je pakket is bezorgd. Vertel je ons wat je ervan vindt? {review_link}",
      "",
      "Liever geen mails meer? Schrijf je uit via {uitschrijf_link}",
      "",
      "Weer op voorraad: {voorraad_link}. Groet, Sofía"
    ].join("\n")
    expect(fillLinks(text, LINKS)).toBe(
      [
        "Hoi Lena,",
        "",
        "Je pakket is bezorgd. Vertel je ons wat je ervan vindt? https://northwind.store/review",
        "",
        "Liever geen mails meer?",
        "",
        "Weer op voorraad: https://northwind.store/terug. Groet, Sofía"
      ].join("\n")
    )
  })

  it("ends a sentence at its stop before a space, not at an address's dots", () => {
    expect(fillLinks("Kijk op www.northwind.store of {uitschrijf_link}. Tot snel!", LINKS)).toBe("Tot snel!")
    expect(fillLinks("Groet. Vind ons op northwind.store: {review_link}", LINKS)).toBe(
      "Groet. Vind ons op northwind.store: https://northwind.store/review"
    )
  })

  it("drops a line left empty, and leaves words without a variable as they were", () => {
    expect(fillLinks("Hoi,\n\n{uitschrijf_link}\n\nGroet", LINKS)).toBe("Hoi,\n\nGroet")
    expect(fillLinks("  Hoi Lena,\n\nTot snel!  ", LINKS)).toBe("  Hoi Lena,\n\nTot snel!  ")
    expect(fillLinks("Je review: {review_link}", linksOf(undefined))).toBe("")
    // A link standing alone after its question goes with the question.
    expect(fillLinks("Bezorgd. Vertel je ons wat je ervan vindt? {review_link}", linksOf(undefined))).toBe("Bezorgd.")
  })

  it("keeps only https links of the saved section", () => {
    expect(linksOf({ review: " https://a.example/r ", unsubscribe: "http://a.example", restock: 4 })).toEqual({
      review: "https://a.example/r",
      unsubscribe: "",
      restock: ""
    })
  })
})

describe("Huisstijl's look", () => {
  it("lets a colour through only where white text reads on it", () => {
    expect(buttonColorOf({ color: "#1f3a5f" })).toBe("#1F3A5F")
    expect(buttonColorOf({ color: "#036" })).toBe("#003366")
    expect(buttonColorOf({ color: "#FFD400" })).toBeNull()
    expect(buttonColorOf({ color: "blauw" })).toBeNull()
    expect(buttonColorOf(undefined)).toBeNull()
  })

  it("reads the saved logo's file, and writes the path anyone loads it from", () => {
    expect(logoFileOf({ logoFileId: "fil_0123456789abcdefghjkmnpqrs" })).toBe("fil_0123456789abcdefghjkmnpqrs")
    expect(logoFileOf({ logoFileId: null })).toBeNull()
    expect(logoFileOf({ logoFileId: "../../etc" })).toBeNull()
    expect(logoPath("wks_1", "fil_2")).toBe("/api/brand/wks_1/logo/fil_2")
  })
})
