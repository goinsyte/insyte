import { LabelNotIssued, Labels } from "@insyte/modules/returns/domain/Ports"
import { Effect, Layer } from "effect"

/*
 * Sendcloud's recorded twin (integrations.md §1.1), for the worker tests and local runs. A return address whose city
 * has `BAD` in it is refused as Sendcloud refuses an unknown postcode; `DOWN` is unreachable, worth another try. Any
 * other gets a label: tracking `3SRET<reference digits>`, a parcel of its own (unique, as Sendcloud's are), and a
 * one-page PDF.
 */

const PDF = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 298 420]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
)

export const SendcloudRecorded = Layer.succeed(Labels)(Labels.of({
  configured: true,
  issue: (input) => {
    if (input.to.city.includes("BAD")) {
      return Effect.fail(new LabelNotIssued({ reason: "Sendcloud antwoordde 400: postcode onbekend", retry: false }))
    }
    if (input.to.city.includes("DOWN")) {
      return Effect.fail(new LabelNotIssued({ reason: "Sendcloud was niet bereikbaar", retry: true }))
    }
    const digits = input.reference.replace(/\D/g, "")
    return Effect.succeed({
      carrier: input.carrier,
      tracking: `3SRET${digits}`,
      trackingUrl: `https://tracking.sendcloud.sc/forward?code=3SRET${digits}`,
      parcelRef: `sendcloud:${crypto.randomUUID()}`,
      pdf: PDF
    })
  }
}))
