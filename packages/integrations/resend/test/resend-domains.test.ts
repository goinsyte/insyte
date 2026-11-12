import { recordsOf, SendingDomains } from "@insyte/modules/settings/domain/SendingDomain"
import { ConfigProvider, Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { ResendDomains, SendingDomainsUnset } from "../src/ResendDomains.ts"

/*
 * The sending-domain adapter (M17 step 20.1c) against answers in the shape Resend's domains API documents them and
 * Cloudflare's DNS-over-HTTPS JSON gives them (`recorded/`, example.com only): what it asks, how it reads the records,
 * and that a sending-only key, a taken name and an unreachable Resend each come back as what they are, never as records.
 */

const recorded = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./recorded/${name}.json`, import.meta.url), "utf8"))

interface Seen {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: unknown
}

/** A fake Resend and DNS: answers by method and path from a table, records what it was asked. */
const fake = (answers: Record<string, () => Response>, seen: Array<Seen> = []) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.tryPromise({
        try: async () => {
          const raw = (request.body as { body?: Uint8Array }).body
          const text = raw === undefined ? "" : new TextDecoder().decode(raw)
          seen.push({
            method: request.method,
            url: url.href,
            headers: request.headers,
            body: text === "" ? undefined : JSON.parse(text)
          })
          const answer = answers[`${request.method} ${url.pathname}`]
          if (answer === undefined) throw new Error(`unexpected ${request.method} ${url.href}`)
          return HttpClientResponse.fromWeb(request, answer())
        },
        catch: (cause) =>
          new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
      })
    )
  )

const config = ConfigProvider.layer(ConfigProvider.fromEnvRecord({ RESEND_API_KEY: "re_full_key" }))

const ID = "4dd369bc-aa82-4ff3-97de-514ae3000ee0"

const using = <A, E>(
  http: Layer.Layer<HttpClient.HttpClient>,
  f: (domains: typeof SendingDomains.Service) => Effect.Effect<A, E>
) =>
  Effect.runPromiseExit(
    Effect.flatMap(Effect.service(SendingDomains), f).pipe(
      Effect.provide(ResendDomains.pipe(Layer.provide(http), Layer.provide(config)))
    )
  )

describe("ResendDomains", () => {
  it("makes the domain in the EU region with the key as a bearer token, and reads its records", async () => {
    const seen: Array<Seen> = []
    const http = fake({ "POST /domains": () => Response.json(recorded("domain-created"), { status: 201 }) }, seen)
    const made = await using(http, (d) => d.create("example.com"))
    expect(seen[0]).toMatchObject({
      method: "POST",
      url: "https://api.resend.com/domains",
      body: { name: "example.com", region: "eu-west-1" }
    })
    expect(seen[0]?.headers["authorization"]).toBe("Bearer re_full_key")
    if (!Exit.isSuccess(made)) throw new Error("not made")
    expect(made.value).toMatchObject({ id: ID, name: "example.com", status: "not_started", region: "eu-west-1" })
    // The page's four: Tracking is left out, DMARC comes from the DNS.
    expect(recordsOf(made.value, false).map((r) => [r.id, r.type, r.name, r.status, r.reason])).toEqual([
      ["mx", "MX", "send", "missing", "not_started"],
      ["spf", "TXT", "send", "missing", "not_started"],
      ["dkim", "TXT", "resend._domainkey", "missing", "not_started"],
      ["dmarc", "TXT", "_dmarc", "missing", "not_started"]
    ])
  })

  it("asks Resend to check again, and reads each record's status as the page shows it", async () => {
    const seen: Array<Seen> = []
    const http = fake({
      [`POST /domains/${ID}/verify`]: () => Response.json(recorded("verify")),
      [`GET /domains/${ID}`]: () => Response.json(recorded("domain-checking"))
    }, seen)
    const checked = await using(http, (d) => Effect.andThen(d.verify(ID), d.get(ID)))
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      `POST https://api.resend.com/domains/${ID}/verify`,
      `GET https://api.resend.com/domains/${ID}`
    ])
    if (!Exit.isSuccess(checked)) throw new Error("not read")
    expect(checked.value.status).toBe("partially_verified")
    expect(recordsOf(checked.value, true).map((r) => [r.id, r.status, r.reason])).toEqual([
      ["mx", "pending", null],
      ["spf", "missing", "failed"],
      ["dkim", "found", null],
      ["dmarc", "found", null]
    ])
    const verified = await using(
      fake({ [`GET /domains/${ID}`]: () => Response.json(recorded("domain-verified")) }),
      (d) => d.get(ID)
    )
    expect(Exit.isSuccess(verified) && verified.value.status).toBe("verified")
  })

  it("finds DMARC in the DNS, in parts and quoted, and none where the name does not exist", async () => {
    const seen: Array<Seen> = []
    const found = await using(
      fake({ "GET /dns-query": () => Response.json(recorded("dmarc-found")) }, seen),
      (d) => d.dmarc("example.com")
    )
    expect(found).toEqual(Exit.succeed(true))
    expect(seen[0]?.url).toBe("https://cloudflare-dns.com/dns-query?name=_dmarc.example.com&type=TXT")
    expect(seen[0]?.headers["accept"]).toBe("application/dns-json")
    // The DNS is asked without Resend's key.
    expect(seen[0]?.headers["authorization"]).toBeUndefined()
    const none = await using(
      fake({ "GET /dns-query": () => Response.json(recorded("dmarc-none")) }),
      (d) => d.dmarc("example.com")
    )
    expect(none).toEqual(Exit.succeed(false))
  })

  it("says a sending-only key cannot manage domains, a taken name is taken, and an unreachable Resend failed", async () => {
    const restricted = await using(
      fake({ [`GET /domains/${ID}`]: () => Response.json(recorded("restricted"), { status: 401 }) }),
      (d) => d.get(ID)
    )
    expect(JSON.stringify(restricted)).toContain("DomainsUnavailable")
    const taken = await using(
      fake({ "POST /domains": () => Response.json(recorded("taken"), { status: 403 }) }),
      (d) => d.create("example.com")
    )
    expect(JSON.stringify(taken)).toContain("DomainTaken")
    const down = await using(
      fake({ [`GET /domains/${ID}`]: () => new Response("upstream", { status: 503 }) }),
      (d) => d.get(ID)
    )
    expect(JSON.stringify(down)).toContain("resend 503")
    const unreachable = await using(fake({}), (d) => d.verify(ID))
    expect(JSON.stringify(unreachable)).toContain("resend unreachable")
    expect(JSON.stringify([restricted, taken, down, unreachable])).not.toContain("re_full_key")
  })

  it("without a key, is not configured and says so on every call", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(
        Effect.service(SendingDomains),
        (d) => Effect.map(Effect.exit(d.create("example.com")), (made) => ({ configured: d.configured, made }))
      ).pipe(
        Effect.provide(SendingDomainsUnset)
      )
    )
    expect(Exit.isSuccess(exit) && exit.value.configured).toBe(false)
    expect(JSON.stringify(exit)).toContain("DomainsUnavailable")
  })
})
