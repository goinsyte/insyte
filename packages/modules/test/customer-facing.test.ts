import { describe, expect, it } from "vitest"
import {
  buttonColorOf,
  contactOf,
  fillLinks,
  lacksUnsubscribe,
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
    // AfterShip's ready-for-pickup and missed delivery have their own wording.
    expect(parcelStatusOf("in_transit", null, "available_for_pickup")).toBe("pickup")
    expect(parcelStatusOf("exception", "in_transit", "failed_attempt")).toBe("failed")
    expect(parcelStatusOf("delivered", null, "failed_attempt")).toBe("delivered")
  })

  it("says the saved sentence with the carrier in, and the default where nothing is saved", () => {
    const saved = { statuses: [{ id: "local", label: "Bijna bij je, met {vervoerder}", show: "line" }] }
    expect(wordingFor(saved, "local", "DHL")).toEqual({ text: "Bijna bij je, met DHL", show: "line" })
    expect(wordingFor(undefined, "local", "PostNL")).toEqual({ text: "Onderweg met PostNL", show: "all" })
    expect(wordingFor(undefined, "local", null)).toEqual({ text: "Onderweg met de vervoerder", show: "all" })
    // A carrier's name is put in as written, `$` and all: no replacement patterns.
    expect(wordingFor(undefined, "local", "Pakket$& Co $'").text).toBe("Onderweg met Pakket$& Co $'")
    // A status the saved value lacks, or a row an older page wrote badly, reads as a new workspace's.
    expect(wordingFor(saved, "delivered", "DHL")).toEqual({ text: "Bezorgd", show: "all" })
    expect(wordingFor({ statuses: [{ id: "out", label: " ", show: "nowhere" }] }, "out", null)).toEqual({
      text: "Wordt vandaag bezorgd",
      show: "all"
    })
  })
})

describe("Sjablonen' links", () => {
  const none = linksOf(undefined)

  it("puts each link in for its variable, and takes out only an empty one with its lead-in", () => {
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
        "Liever geen mails meer? Schrijf je uit",
        "",
        "Weer op voorraad: https://northwind.store/terug. Groet, Sofía"
      ].join("\n")
    )
  })

  it("never deletes the team's other words or sentences", () => {
    expect(fillLinks("Je pakket is onderweg. {review_link}", none)).toBe("Je pakket is onderweg.")
    expect(fillLinks("Kijk bijv. op {review_link} en laat iets weten. Groet", none)).toBe(
      "Kijk bijv. en laat iets weten. Groet"
    )
    expect(fillLinks("We bezorgen op di. Wat vind je? {review_link}", none)).toBe("We bezorgen op di. Wat vind je?")
    expect(fillLinks("Tot ma. {review_link}", none)).toBe("Tot ma.")
    expect(fillLinks("Bezorgd. Vertel je ons wat je ervan vindt? {review_link}", none)).toBe(
      "Bezorgd. Vertel je ons wat je ervan vindt?"
    )
  })

  it("takes the lead-in and its colon with the link, and tidies what is left", () => {
    expect(fillLinks("Kijk hier: {review_link} voor je kortingscode van 10%.", none)).toBe(
      "Kijk voor je kortingscode van 10%."
    )
    expect(fillLinks("Review: {review_link}, dan weten we het.", none)).toBe("Review, dan weten we het.")
    expect(fillLinks("Wat vind je ervan? {review_link} Hij is weer binnen: {voorraad_link}.", none)).toBe(
      "Wat vind je ervan? Hij is weer binnen."
    )
    expect(fillLinks("Hoi,\n\n{uitschrijf_link}\n\nGroet", LINKS)).toBe("Hoi,\n\nGroet")
    expect(fillLinks("Hoi,\n\nVia: {uitschrijf_link}.\n\nGroet", LINKS)).toBe("Hoi,\n\nGroet")
  })

  it("answers nothing where no letter is left, which the caller refuses as an empty body", () => {
    expect(fillLinks("{review_link}", none)).toBe("")
    expect(fillLinks("Hier: {review_link}. {voorraad_link}", none)).toBe("")
    expect(fillLinks("Je review: {review_link}", none)).toBe("Je review")
  })

  it("ends nothing at an address's dots", () => {
    expect(fillLinks("Groet. Vind ons op northwind.store: {review_link}", LINKS)).toBe(
      "Groet. Vind ons op northwind.store: https://northwind.store/review"
    )
  })

  it("puts a link in as saved, `$` and all", () => {
    const links = { ...LINKS, review: "https://a.example/r?x=$&y=$'z=$`" }
    expect(fillLinks("Hier: {review_link}", links)).toBe("Hier: https://a.example/r?x=$&y=$'z=$`")
  })

  it("leaves words without a variable as they were", () => {
    expect(fillLinks("  Hoi Lena,\n\nTot snel!  ", LINKS)).toBe("  Hoi Lena,\n\nTot snel!  ")
  })

  it("refuses a mail that asks for the unsubscribe link while none is saved, and only that one", () => {
    // The unsubscribe line is the one that may not drop out: the mail waits for the link instead.
    expect(
      lacksUnsubscribe(["Nieuw binnen", "Kijk hier: {voorraad_link}\n\nSchrijf je uit via {uitschrijf_link}"], LINKS)
    )
      .toBe(true)
    expect(lacksUnsubscribe(["{uitschrijf_link}", ""], LINKS)).toBe(true)
    // Saved, it is put in; a mail that never asks for it goes as it always did.
    expect(
      lacksUnsubscribe(["Schrijf je uit via {uitschrijf_link}"], { ...LINKS, unsubscribe: "https://a.example/uit" })
    )
      .toBe(false)
    expect(lacksUnsubscribe(["Vertel je ons wat je ervan vindt? {review_link}"], { ...LINKS, review: "" })).toBe(false)
  })

  it("keeps only https links of the saved section", () => {
    expect(linksOf({ review: " https://a.example/r ", unsubscribe: "http://a.example", restock: 4 })).toEqual({
      review: "https://a.example/r",
      unsubscribe: "",
      restock: ""
    })
  })
})

describe("Huisstijl's contact", () => {
  it("names the store and says how to reach it, each only as the page saves it", () => {
    expect(contactOf({ sender: " Jouw Winkel ", website: "https://a.example", support: "hulp@a.example" })).toEqual(
      {
        name: "Jouw Winkel",
        website: "https://a.example",
        support: "hulp@a.example"
      }
    )
    expect(contactOf(undefined)).toEqual({ name: null, website: null, support: null })
    expect(contactOf({ sender: "", website: "abc", support: "geen-mail" })).toEqual({
      name: null,
      website: null,
      support: null
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
