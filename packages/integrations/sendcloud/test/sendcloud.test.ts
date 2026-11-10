import { type LabelAddress, Labels } from "@insyte/modules/returns/domain/Ports"
import { ConfigProvider, Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { SendcloudLive } from "../src/Sendcloud.ts"

/*
 * Sendcloud's adapter against a fake transport: the carrier's return product looked up for the route, the return
 * announced with both addresses, its tracking read and the label fetched, and the refusals in Insyte's words.
 */

interface Seen {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: string
}

const sendcloud = (answer: (seen: Seen) => Response, seen: Array<Seen> = []) =>
  SendcloudLive.pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request, url) =>
        Effect.tryPromise({
          try: async () => {
            const raw = request.body as { body?: Uint8Array }
            const one = {
              method: request.method,
              url: url.href,
              headers: request.headers as Record<string, string>,
              body: raw.body === undefined ? "" : new TextDecoder().decode(raw.body)
            }
            seen.push(one)
            return HttpClientResponse.fromWeb(request, answer(one))
          },
          catch: (cause) =>
            new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
        })
      )
    )),
    Layer.provide(ConfigProvider.layer(
      ConfigProvider.fromEnvRecord({ SENDCLOUD_PUBLIC_KEY: "pub", SENDCLOUD_SECRET_KEY: "sec" })
    ))
  )

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const SHOPPER: LabelAddress = {
  name: "Klant 1",
  line1: "Kerkstraat 1",
  postcode: "1011 AA",
  city: "Amsterdam",
  country: "NL",
  email: "klant@example.com"
}
const STORE: LabelAddress = {
  name: "Northwind Retouren",
  line1: "Distributieweg 12",
  postcode: "3045 AB",
  city: "Rotterdam",
  country: "NL"
}
const input = { reference: "R-1042", carrier: "PostNL", from: SHOPPER, to: STORE, weightGrams: 1000 }

const issue = (layer: ReturnType<typeof sendcloud>) =>
  Effect.runPromiseExit(Effect.flatMap(Effect.service(Labels), (l) => l.issue(input)).pipe(Effect.provide(layer)))

const happy = (seen: Seen) => {
  if (seen.url.endsWith("/shipping-options")) return json({ data: [{ code: "postnl:return/standard" }] })
  if (seen.url.endsWith("/returns/announce-synchronously")) return json({ return_id: 77, parcel_id: 880 }, 201)
  if (seen.url.endsWith("/returns/77")) {
    return json({ tracking_number: "3SRET1042", tracking_url: "https://tracking.example/3SRET1042" })
  }
  if (seen.url.endsWith("/parcels/880/documents/label")) return new Response(new Uint8Array([37, 80, 68, 70]))
  return json({}, 404)
}

describe("SendcloudLive", () => {
  it("finds the carrier's return product, announces the return and fetches its label", async () => {
    const seen: Array<Seen> = []
    const exit = await issue(sendcloud(happy, seen))
    expect(Exit.isSuccess(exit) && { ...exit.value, pdf: [...exit.value.pdf] }).toEqual({
      carrier: "PostNL",
      tracking: "3SRET1042",
      trackingUrl: "https://tracking.example/3SRET1042",
      parcelRef: "sendcloud:880",
      pdf: [37, 80, 68, 70]
    })
    expect(seen.map((s) => `${s.method} ${s.url.replace("https://panel.sendcloud.sc/api/v3", "")}`)).toEqual([
      "POST /shipping-options",
      "POST /returns/announce-synchronously",
      "GET /returns/77",
      "GET /parcels/880/documents/label"
    ])
    expect(seen[0]!.headers["authorization"]).toBe(`Basic ${btoa("pub:sec")}`)
    expect(JSON.parse(seen[0]!.body)).toMatchObject({ carrier_code: "postnl", functionalities: { returns: true } })
    expect(JSON.parse(seen[1]!.body)).toEqual({
      from_address: {
        name: "Klant 1",
        address_line_1: "Kerkstraat 1",
        postal_code: "1011 AA",
        city: "Amsterdam",
        country_code: "NL",
        email: "klant@example.com"
      },
      to_address: {
        name: "Northwind Retouren",
        address_line_1: "Distributieweg 12",
        postal_code: "3045 AB",
        city: "Rotterdam",
        country_code: "NL"
      },
      ship_with: { type: "shipping_option_code", shipping_option_code: "postnl:return/standard" },
      weight: { value: 1, unit: "kg" },
      order_number: "R-1042",
      external_reference: "R-1042",
      send_tracking_emails: false
    })
  })

  it("says so when the carrier has no return product for the route", async () => {
    const exit = await issue(
      sendcloud((seen) => (seen.url.endsWith("/shipping-options") ? json({ data: [] }) : happy(seen)))
    )
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("geen retourproduct")
  })

  it("passes Sendcloud's refusal on, and marks a 5xx worth another try", async () => {
    const refused = await issue(sendcloud((seen) =>
      seen.url.endsWith("/announce-synchronously")
        ? json({ errors: [{ detail: "Invalid postal code" }] }, 400)
        : happy(seen)
    ))
    expect(Exit.isFailure(refused) && JSON.stringify(refused.cause)).toContain(
      "Sendcloud antwoordde 400: Invalid postal code"
    )
    expect(JSON.stringify(refused)).toContain("\"retry\":false")
    const down = await issue(sendcloud((seen) => (seen.url.endsWith("/returns/77") ? json({}, 503) : happy(seen))))
    expect(JSON.stringify(down)).toContain("\"retry\":true")
  })
})
