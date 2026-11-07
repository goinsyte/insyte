import { describe, expect, it } from "vitest"
import { isBreached } from "../src/Breached.ts"

/* SHA-1("password123") = CBFDAC6008F9CAB4083784CBD1874F76618D2A97: prefix CBFDA, suffix C6008F9CAB4083784CBD1874F76618D2A97. */
const PREFIX = "CBFDA"
const SUFFIX = "C6008F9CAB4083784CBD1874F76618D2A97"

const answering = (body: string, seen: Array<string> = []): typeof fetch =>
  ((input: RequestInfo | URL) => {
    seen.push(String(input))
    return Promise.resolve(new Response(body))
  }) as typeof fetch

describe("isBreached", () => {
  it("sends only the first five characters of the hash, and finds the suffix in the answer", async () => {
    const seen: Array<string> = []
    expect(
      await isBreached("password123", answering(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:2254650`, seen))
    )
      .toBe(true)
    expect(seen).toEqual([`https://api.pwnedpasswords.com/range/${PREFIX}`])
  })

  it("does not count a padding line (count 0) or another suffix", async () => {
    expect(await isBreached("password123", answering(`${SUFFIX}:0\r\n0018A45C4D1DEF81644B54AB7F969B88D65:3`))).toBe(
      false
    )
  })

  it("fails open when HIBP errors, refuses, or does not answer in time", async () => {
    const failing = (() => Promise.reject(new Error("offline"))) as typeof fetch
    const refusing = (() => Promise.resolve(new Response("", { status: 503 }))) as typeof fetch
    const hanging =
      ((_: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        )) as typeof fetch
    expect(await isBreached("password123", failing)).toBe(false)
    expect(await isBreached("password123", refusing)).toBe(false)
    expect(await isBreached("password123", hanging, 20)).toBe(false)
  })
})
