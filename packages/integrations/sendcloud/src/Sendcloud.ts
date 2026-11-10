import { type LabelAddress, LabelNotIssued, Labels } from "@insyte/modules/returns/domain/Ports"
import { Config, Duration, Effect, Layer, Redacted } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"

/*
 * Sendcloud (M9.2; integrations.md §5.1): a return label through its v3 Returns API, with the account's public and
 * secret key (HTTP Basic). The carrier's return product is the first Sendcloud offers for the route; the return is
 * announced synchronously, so a carrier's refusal comes back at once; then its tracking is read and the A6 label fetched.
 */

const BASE = "https://panel.sendcloud.sc/api/v3"
const TIMEOUT = Duration.seconds(20)

/** Insyte's carriers as Sendcloud's carrier codes. */
export const CARRIER_CODES: Readonly<Record<string, string>> = { PostNL: "postnl", DHL: "dhl", DPD: "dpd", UPS: "ups" }

type Raw = Record<string, unknown>

/** An address as Sendcloud reads one. */
export const addressOf = (a: LabelAddress) => ({
  name: a.name,
  address_line_1: a.line1,
  postal_code: a.postcode,
  city: a.city,
  country_code: a.country,
  ...(a.email === undefined ? {} : { email: a.email }),
  ...(a.phone === undefined ? {} : { phone_number: a.phone })
})

/** Sendcloud's own words for a refusal, where it gave them. */
const messageOf = (json: unknown) => {
  const errors = (json as { errors?: Array<{ detail?: string; message?: string }> } | undefined)?.errors
  const first = errors?.[0]
  return first?.detail ?? first?.message ?? (json as { message?: string } | undefined)?.message
}

/** A refusal, with Sendcloud's message; a 429 or 5xx is worth trying again. */
const refused = (status: number, json: unknown) =>
  new LabelNotIssued({
    reason: `Sendcloud antwoordde ${status}${messageOf(json) ? `: ${messageOf(json)}` : ""}`,
    retry: status === 429 || status >= 500
  })

const ok = (status: number) => status >= 200 && status < 300

export const SendcloudLive = Layer.effect(
  Labels,
  Effect.gen(function*() {
    const http = yield* HttpClient.HttpClient
    const publicKey = yield* Config.Redacted("SENDCLOUD_PUBLIC_KEY")
    const secretKey = yield* Config.Redacted("SENDCLOUD_SECRET_KEY")
    const auth = `Basic ${btoa(`${Redacted.value(publicKey)}:${Redacted.value(secretKey)}`)}`
    const unreachable = () => new LabelNotIssued({ reason: "Sendcloud was niet bereikbaar", retry: true })
    const send = (request: HttpClientRequest.HttpClientRequest) =>
      http.execute(request.pipe(HttpClientRequest.setHeaders({ authorization: auth }))).pipe(
        Effect.timeout(TIMEOUT),
        Effect.mapError(unreachable)
      )
    const json = (request: HttpClientRequest.HttpClientRequest) =>
      Effect.flatMap(send(request), (response) =>
        Effect.map(
          response.json.pipe(Effect.orElseSucceed(() => ({}))),
          (body) => ({ status: response.status, json: body as Raw })
        ))
    const post = (path: string, body: unknown) =>
      json(
        HttpClientRequest.post(`${BASE}${path}`).pipe(
          HttpClientRequest.bodyText(JSON.stringify(body), "application/json")
        )
      )

    return Labels.of({
      configured: true,
      issue: Effect.fn("Sendcloud.issue")(function*(input) {
        const carrierCode = CARRIER_CODES[input.carrier]
        if (carrierCode === undefined) {
          return yield* new LabelNotIssued({ reason: `Sendcloud kent ${input.carrier} niet`, retry: false })
        }
        const weight = { value: Math.max(input.weightGrams, 1) / 1000, unit: "kg" }
        const options = yield* post("/shipping-options", {
          from_address: { country_code: input.from.country, postal_code: input.from.postcode },
          to_address: { country_code: input.to.country, postal_code: input.to.postcode },
          carrier_code: carrierCode,
          functionalities: { returns: true },
          parcels: [{ weight }]
        })
        if (!ok(options.status)) return yield* refused(options.status, options.json)
        const option = (options.json["data"] as Array<{ code?: string }> | undefined)?.[0]?.code
        if (option === undefined) {
          return yield* new LabelNotIssued({
            reason: `${input.carrier} heeft in je Sendcloud-account geen retourproduct voor deze route`,
            retry: false
          })
        }
        const created = yield* post("/returns/announce-synchronously", {
          from_address: addressOf(input.from),
          to_address: addressOf(input.to),
          ship_with: { type: "shipping_option_code", shipping_option_code: option },
          weight,
          order_number: input.reference,
          external_reference: input.reference,
          send_tracking_emails: false
        })
        if (!ok(created.status)) return yield* refused(created.status, created.json)
        const returnId = created.json["return_id"]
        const parcelId = created.json["parcel_id"]
        if (returnId === undefined || parcelId === undefined) {
          return yield* new LabelNotIssued({ reason: "Sendcloud gaf geen retour terug", retry: true })
        }
        const read = yield* json(HttpClientRequest.get(`${BASE}/returns/${encodeURIComponent(String(returnId))}`))
        if (!ok(read.status)) return yield* refused(read.status, read.json)
        const tracking = read.json["tracking_number"]
        if (typeof tracking !== "string" || tracking === "") {
          return yield* new LabelNotIssued({ reason: "Sendcloud heeft de retour nog niet aangemeld", retry: true })
        }
        const label = yield* send(
          HttpClientRequest.get(`${BASE}/parcels/${encodeURIComponent(String(parcelId))}/documents/label`).pipe(
            HttpClientRequest.setHeaders({ accept: "application/pdf" })
          )
        )
        if (!ok(label.status)) return yield* refused(label.status, {})
        const pdf = new Uint8Array(yield* label.arrayBuffer.pipe(Effect.mapError(unreachable)))
        return {
          carrier: input.carrier,
          tracking,
          trackingUrl: typeof read.json["tracking_url"] === "string" ? read.json["tracking_url"] : null,
          parcelRef: `sendcloud:${String(parcelId)}`,
          pdf
        }
      })
    })
  })
)

/** Where no Sendcloud account is set up: no labels; a return goes back by "zelf versturen". */
export const LabelsUnset = Layer.succeed(Labels)(Labels.of({
  configured: false,
  issue: () =>
    Effect.fail(new LabelNotIssued({ reason: "Er is geen vervoerder voor retourlabels ingesteld", retry: false }))
}))
