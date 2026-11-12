import { ReferenceRates } from "@insyte/modules/fx/domain/Rates"
import { Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { EcbLive, parseRates, RECENT_URL } from "../src/Ecb.ts"
import { EcbRecorded } from "../src/EcbRecorded.ts"

/*
 * The ECB's adapter against a recorded response: the first six working days of `eurofxref-hist-90d.xml` as the ECB
 * served it on 12 November 2026 (a weekend among them), read through a fake transport.
 */

const RECORDED = readFileSync(new URL("./eurofxref-hist-90d.xml", import.meta.url), "utf8")

const ecb = (answer: () => Response, seen: Array<string> = []) =>
  EcbLive.pipe(Layer.provide(Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.tryPromise({
        try: async () => {
          seen.push(url.href)
          return HttpClientResponse.fromWeb(request, answer())
        },
        catch: (cause) =>
          new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
      })
    )
  )))

const recent = (layer: Layer.Layer<ReferenceRates>) =>
  Effect.runPromiseExit(Effect.flatMap(Effect.service(ReferenceRates), (r) => r.recent).pipe(Effect.provide(layer)))

describe("EcbLive", () => {
  it("reads the recorded file as days of rates, newest first, the decimals as the ECB wrote them", async () => {
    const seen: Array<string> = []
    const exit = await recent(ecb(() => new Response(RECORDED, { headers: { "content-type": "text/xml" } }), seen))
    expect(seen).toEqual([RECENT_URL])
    expect(Exit.isSuccess(exit)).toBe(true)
    const days = Exit.isSuccess(exit) ? exit.value : []
    // Friday the 6th, then Monday the 9th: no rates on the weekend.
    expect(days.map((d) => d.day)).toEqual([
      "2026-11-12",
      "2026-11-11",
      "2026-11-10",
      "2026-11-09",
      "2026-11-06",
      "2026-11-05"
    ])
    expect(days.every((d) => d.rates.length === 29)).toBe(true)
    expect(days[0]!.rates.slice(0, 2)).toEqual([{ currency: "USD", rate: "1.1081" }, {
      currency: "JPY",
      rate: "176.96"
    }])
    expect(days[0]!.rates.find((r) => r.currency === "GBP")).toEqual({ currency: "GBP", rate: "0.83595" })
    expect(days[0]!.rates.some((r) => r.currency === "EUR")).toBe(false)
  })

  it("says the ECB could not be read, rather than answering no rates", async () => {
    const down = await recent(ecb(() => new Response("Service Unavailable", { status: 503 })))
    expect(Exit.isFailure(down) && JSON.stringify(down.cause)).toContain("De ECB antwoordde 503")
    const empty = await recent(ecb(() => new Response("<gesmes:Envelope><Cube></Cube></gesmes:Envelope>")))
    expect(Exit.isFailure(empty) && JSON.stringify(empty.cause)).toContain("De ECB stuurde geen koersen")
  })

  it("leaves out what does not read as a rate", () => {
    expect(parseRates(`<Cube time="2026-11-06"><Cube currency="USD" rate="1.1165"/><Cube currency="XXX" rate="0"/>
      <Cube currency="usd" rate="1"/><Cube currency="GBP" rate="n/a"/></Cube><Cube time="2026-11-07"></Cube>`))
      .toEqual([{ day: "2026-11-06", rates: [{ currency: "USD", rate: "1.1165" }] }])
  })
})

describe("EcbRecorded", () => {
  it("is three working days of the recorded file, the weekend between without rates", async () => {
    const exit = await recent(EcbRecorded)
    const days = Exit.isSuccess(exit) ? exit.value : []
    expect(days.map((d) => d.day)).toEqual(["2026-11-10", "2026-11-09", "2026-11-06"])
    const recorded = parseRates(RECORDED)
    for (const day of days) {
      const whole = recorded.find((d) => d.day === day.day)!
      for (const rate of day.rates) expect(whole.rates).toContainEqual(rate)
    }
  })
})
