import {
  DomainsFailed,
  DomainsUnavailable,
  DomainTaken,
  type ProviderDomain,
  SendingDomains
} from "@insyte/modules/settings/domain/SendingDomain"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/*
 * The `SendingDomains` port over Resend's domains API (M17 step 20.1c; ADR-0018): make a domain, read it with its
 * records and their status, and ask Resend to check them again. No SDK, as for sending (`Resend.ts`). DMARC is not a
 * Resend record, so it is asked of the DNS itself over Cloudflare's DNS-over-HTTPS JSON API.
 *
 * Resend's keys are full access or sending only; a sending-only key is refused on `/domains` (`restricted_api_key`).
 * That, a key Resend does not know, or none at all is `DomainsUnavailable`: the page says the feature is not available,
 * never a record that is not real. The key travels as a bearer token, which Effect's client redacts in its traces.
 */

const API = "https://api.resend.com/domains"
const DOH = "https://cloudflare-dns.com/dns-query"
/** Insyte's shops are European; the region decides where Resend sends from (the MX of the return path). */
const REGION = "eu-west-1"

const Record = Schema.Struct({
  record: Schema.String,
  type: Schema.String,
  name: Schema.String,
  value: Schema.String,
  status: Schema.String,
  priority: Schema.optional(Schema.Finite)
})

const Domain = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  status: Schema.String,
  region: Schema.optional(Schema.String),
  records: Schema.optional(Schema.Array(Record))
})

const Refused = Schema.Struct({ name: Schema.optional(Schema.String), message: Schema.optional(Schema.String) })

const Dns = Schema.Struct({
  Status: Schema.Int,
  Answer: Schema.optional(Schema.Array(Schema.Struct({ type: Schema.Int, data: Schema.String })))
})

/** A domain as the port has it. */
const providerOf = (d: typeof Domain.Type): ProviderDomain => ({
  id: d.id,
  name: d.name,
  status: d.status,
  region: d.region ?? REGION,
  records: (d.records ?? []).map((r) => ({ ...r }))
})

/** Whether one of `_dmarc.<name>`'s TXT strings is a DMARC policy (a TXT's data comes quoted, maybe in parts). */
export const hasDmarc = (answer: typeof Dns.Type) =>
  (answer.Answer ?? []).some((a) =>
    a.type === 16 && /^v=DMARC1\b/i.test(a.data.replace(/"\s*"/g, "").replace(/"/g, ""))
  )

/** Resend refused: the key cannot manage domains, the name is taken, or another reason in Resend's own words. */
const refusal = (status: number, refused: typeof Refused.Type) => {
  const name = refused.name ?? ""
  const message = refused.message ?? ""
  if (status === 401 || name === "restricted_api_key" || name === "missing_api_key" || name === "invalid_api_key") {
    return new DomainsUnavailable()
  }
  if (/already|registered|exists/i.test(message)) return new DomainTaken()
  return new DomainsFailed({ reason: `resend ${status}: ${name} ${message}`.trim() })
}

/** Only a create can find the name taken; anywhere else that answer is a refusal like another. */
const notTaken = <A>(effect: Effect.Effect<A, DomainsUnavailable | DomainTaken | DomainsFailed>) =>
  Effect.catchTag(effect, "DomainTaken", () => Effect.fail(new DomainsFailed({ reason: "resend: taken" })))

export const ResendDomains = Layer.effect(
  SendingDomains,
  Effect.gen(function*() {
    const apiKey = yield* Config.Redacted("RESEND_API_KEY")
    const client = yield* HttpClient.HttpClient

    const call = <S extends Schema.Constraint & { readonly DecodingServices: never }>(
      request: HttpClientRequest.HttpClientRequest,
      schema: S
    ): Effect.Effect<S["Type"], DomainsUnavailable | DomainTaken | DomainsFailed> =>
      Effect.gen(function*() {
        const response = yield* client.execute(HttpClientRequest.bearerToken(request, Redacted.value(apiKey))).pipe(
          Effect.timeout("10 seconds"),
          Effect.mapError((error) => new DomainsFailed({ reason: `resend unreachable: ${String(error)}` }))
        )
        if (response.status >= 200 && response.status < 300) {
          return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
            Effect.mapError(() =>
              new DomainsFailed({ reason: `resend ${response.status}: an answer it did not expect` })
            )
          )
        }
        const refused = yield* HttpClientResponse.schemaBodyJson(Refused)(response).pipe(
          Effect.orElseSucceed(() => ({ name: undefined, message: undefined }))
        )
        return yield* refusal(response.status, refused)
      })

    const get = Effect.fn("ResendDomains.get")(function*(id: string) {
      return providerOf(yield* call(HttpClientRequest.get(`${API}/${encodeURIComponent(id)}`), Domain).pipe(notTaken))
    })

    return SendingDomains.of({
      configured: true,
      create: Effect.fn("ResendDomains.create")(function*(name: string) {
        const made = yield* call(
          HttpClientRequest.post(API).pipe(HttpClientRequest.bodyJsonUnsafe({ name, region: REGION })),
          Domain
        )
        // The create answers the records; a read is the same shape, with the region, should the create leave them out.
        return made.records === undefined ? yield* get(made.id) : providerOf(made)
      }),
      get,
      verify: Effect.fn("ResendDomains.verify")(function*(id: string) {
        yield* call(
          HttpClientRequest.post(`${API}/${encodeURIComponent(id)}/verify`),
          Schema.Struct({ id: Schema.optional(Schema.String) })
        ).pipe(notTaken)
      }),
      dmarc: Effect.fn("ResendDomains.dmarc")(function*(name: string) {
        const request = HttpClientRequest.get(DOH).pipe(
          HttpClientRequest.setUrlParams({ name: `_dmarc.${name}`, type: "TXT" }),
          HttpClientRequest.setHeader("accept", "application/dns-json")
        )
        const response = yield* client.execute(request).pipe(
          Effect.timeout("5 seconds"),
          Effect.mapError((error) => new DomainsFailed({ reason: `dns unreachable: ${String(error)}` }))
        )
        if (response.status !== 200) return yield* new DomainsFailed({ reason: `dns ${response.status}` })
        const answer = yield* HttpClientResponse.schemaBodyJson(Dns)(response).pipe(
          Effect.mapError(() => new DomainsFailed({ reason: "dns: an answer it did not expect" }))
        )
        return hasDmarc(answer)
      })
    })
  })
)

/** No key in this environment: the port says so on every call, and E-mail en domein shows it is not available. */
export const SendingDomainsUnset = Layer.succeed(SendingDomains)(SendingDomains.of({
  configured: false,
  create: () => Effect.fail(new DomainsUnavailable()),
  get: () => Effect.fail(new DomainsUnavailable()),
  verify: () => Effect.fail(new DomainsUnavailable()),
  dmarc: () => Effect.succeed(false)
}))
