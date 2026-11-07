import { Effect, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { PwnedPasswords } from "../src/PwnedPasswords.ts"

/* SHA-1("password123") = CBFDAC6008F9CAB4083784CBD1874F76618D2A97: prefix CBFDA, suffix C6008F9CAB4083784CBD1874F76618D2A97. */
const PREFIX = "CBFDA"
const SUFFIX = "C6008F9CAB4083784CBD1874F76618D2A97"

const hibp = (answer: () => Promise<Response>, seen: Array<string> = []) =>
  PwnedPasswords.layer.pipe(Layer.provide(Layer.succeed(
    HttpClient.HttpClient,
    // Fails as Effect's fetch client does when the network does: a typed transport error.
    HttpClient.make((request, url) =>
      Effect.tryPromise({
        try: async () => {
          seen.push(`${url.href} ${request.headers["add-padding"]}`)
          return HttpClientResponse.fromWeb(request, await answer())
        },
        catch: (cause) =>
          new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
      })
    )
  )))

const isBreached = (password: string, layer: ReturnType<typeof hibp>) =>
  Effect.runPromise(
    Effect.flatMap(Effect.service(PwnedPasswords), (p) => p.isBreached(password)).pipe(Effect.provide(layer))
  )

describe("PwnedPasswords", () => {
  it("sends only the first five characters of the hash, padded, and finds the suffix in the answer", async () => {
    const seen: Array<string> = []
    const answer = () => Promise.resolve(new Response(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:2254650`))
    expect(await isBreached("password123", hibp(answer, seen))).toBe(true)
    expect(seen).toEqual([`https://api.pwnedpasswords.com/range/${PREFIX} true`])
  })

  it("does not count a padding line (count 0) or another suffix", async () => {
    const answer = () => Promise.resolve(new Response(`${SUFFIX}:0\r\n0018A45C4D1DEF81644B54AB7F969B88D65:3`))
    expect(await isBreached("password123", hibp(answer))).toBe(false)
  })

  it("fails open when HIBP errors, refuses, or does not answer in time", async () => {
    expect(await isBreached("password123", hibp(() => Promise.reject(new Error("offline"))))).toBe(false)
    expect(await isBreached("password123", hibp(() => Promise.resolve(new Response("", { status: 503 }))))).toBe(false)
    expect(await isBreached("password123", hibp(() => new Promise(() => {})))).toBe(false)
  }, 10_000)

  it("offline, asks no one and finds nothing", async () => {
    expect(await isBreached("password123", PwnedPasswords.layerOffline)).toBe(false)
  })
})
