import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppInfo } from "../src/platform/Bindings.ts"
import { accessKeys, issuerOf, type SigningKey, verifyAccessJwt } from "../src/transports/http/admin/AccessJwt.ts"
import { admit, allowlistOf } from "../src/transports/http/admin/Gate.ts"
import { devOnly } from "../src/transports/http/dev/shared.ts"

/*
 * The staff admin's gate (M18), as pure functions: Cloudflare Access's JWT verified against keys made for the run
 * (never the real team's), and the allowlist over it. The journeys through the Worker are `staff-admin.worker.test.ts`;
 * staging's refusal of the dev header is `staff-admin.staging.test.ts`.
 */

const TEAM = "insyte-test.cloudflareaccess.com"
const ISSUER = issuerOf(TEAM)
const AUD = "staff-aud-0123456789abcdef"
const NOW = 1_800_000_000

const encode = (value: unknown) =>
  btoa(typeof value === "string" ? value : JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "")
const bytes = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")

const pair = async () =>
  (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair

const team = await pair()
const stranger = await pair()
const teamKey: SigningKey = { ...(await crypto.subtle.exportKey("jwk", team.publicKey)) as JsonWebKey, kid: "k1" }
const keys = async () => [teamKey]

const sign = async (
  claims: Record<string, unknown>,
  options: { key?: CryptoKey; header?: Record<string, unknown> } = {}
) => {
  const head = encode(options.header ?? { alg: "RS256", kid: "k1", typ: "JWT" })
  const body = encode(claims)
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    options.key ?? team.privateKey,
    new TextEncoder().encode(`${head}.${body}`)
  )
  return `${head}.${body}.${bytes(signature)}`
}

/** Whether a stage takes the dev header (`devOnly`). */
const on = (environment: "local" | "preview" | "staging" | "production") =>
  Effect.runSync(devOnly.pipe(Effect.provideService(AppInfo, { version: "test", environment })))

const good = { aud: [AUD], iss: ISSUER, email: "Staff@Example.com", iat: NOW - 10, nbf: NOW - 10, exp: NOW + 3600 }
const verify = (token: string | null) => verifyAccessJwt(token, { issuer: ISSUER, audience: AUD, keys, now: NOW })

describe("Access's JWT", () => {
  it("admits a token the team signed for the staff application, by its address in lower case", async () => {
    expect(await verify(await sign(good))).toEqual({ ok: true, email: "staff@example.com" })
  })

  it("refuses a missing token", async () => {
    expect(await verify(null)).toEqual({ ok: false, reason: "missing" })
    expect(await verify("")).toEqual({ ok: false, reason: "missing" })
  })

  it("refuses a forged one: signed by another key, or its claims changed after signing", async () => {
    expect(await verify(await sign(good, { key: stranger.privateKey }))).toEqual({ ok: false, reason: "signature" })
    const [head, , signature] = (await sign(good)).split(".")
    const tampered = `${head}.${encode({ ...good, email: "someone@else.test" })}.${signature}`
    expect(await verify(tampered)).toEqual({ ok: false, reason: "signature" })
  })

  it("refuses one for another application, another team, or none", async () => {
    expect(await verify(await sign({ ...good, aud: ["console-aud"] }))).toEqual({ ok: false, reason: "audience" })
    expect(await verify(await sign({ ...good, aud: undefined }))).toEqual({ ok: false, reason: "audience" })
    expect(await verify(await sign({ ...good, iss: "https://other.cloudflareaccess.com" }))).toEqual({
      ok: false,
      reason: "issuer"
    })
  })

  it("refuses an expired one, and one not yet valid", async () => {
    expect(await verify(await sign({ ...good, exp: NOW - 60 }))).toEqual({ ok: false, reason: "expired" })
    expect(await verify(await sign({ ...good, exp: undefined }))).toEqual({ ok: false, reason: "expired" })
    expect(await verify(await sign({ ...good, nbf: NOW + 600 }))).toEqual({ ok: false, reason: "not_yet_valid" })
  })

  it("refuses alg none or HS256, an unknown key, garbage, and a service token without an address", async () => {
    const [, body] = (await sign(good)).split(".")
    expect(await verify(`${encode({ alg: "none", kid: "k1" })}.${body}.`)).toEqual({ ok: false, reason: "malformed" })
    expect(await verify(await sign(good, { header: { alg: "HS256", kid: "k1" } }))).toEqual({
      ok: false,
      reason: "algorithm"
    })
    expect(await verify(await sign(good, { header: { alg: "RS256", kid: "k9" } }))).toEqual({
      ok: false,
      reason: "unknown_key"
    })
    expect(await verify("not.a.jwt")).toEqual({ ok: false, reason: "malformed" })
    expect(await verify(await sign({ ...good, email: undefined, common_name: "ci-token" }))).toEqual({
      ok: false,
      reason: "no_email"
    })
  })
})

describe("the gate", () => {
  const base = {
    jwt: null,
    devStaff: null,
    dev: false,
    team: TEAM,
    audience: AUD,
    allowlist: allowlistOf("staff@example.com, Second@Example.com"),
    keys: () => keys,
    now: NOW
  }

  it("reads the allowlist as addresses in lower case, and an empty one as nobody", async () => {
    expect([...allowlistOf(" a@x.test,B@X.test  c@x.test ,, nonsense")]).toEqual(["a@x.test", "b@x.test", "c@x.test"])
    expect(await admit({ ...base, allowlist: allowlistOf(""), jwt: await sign(good) })).toEqual({
      ok: false,
      reason: "not_configured"
    })
  })

  it("admits a verified address on the list, and refuses one that is not", async () => {
    expect(await admit({ ...base, jwt: await sign(good) })).toEqual({
      ok: true,
      email: "staff@example.com",
      via: "access"
    })
    expect(await admit({ ...base, jwt: await sign({ ...good, email: "intruder@example.com" }) })).toEqual({
      ok: false,
      reason: "not_on_allowlist"
    })
  })

  it("refuses a JWT when Access is not configured: no team, or no audience", async () => {
    const jwt = await sign(good)
    expect(await admit({ ...base, jwt, team: "" })).toEqual({ ok: false, reason: "not_configured" })
    expect(await admit({ ...base, jwt, audience: "" })).toEqual({ ok: false, reason: "not_configured" })
  })

  it("takes the dev header only where nothing real lives, and the allowlist still decides", async () => {
    expect(await admit({ ...base, devStaff: "staff@example.com" })).toEqual({ ok: false, reason: "missing" })
    expect(await admit({ ...base, dev: true, devStaff: "staff@example.com" })).toEqual({
      ok: true,
      email: "staff@example.com",
      via: "dev"
    })
    expect(await admit({ ...base, dev: true, devStaff: "intruder@example.com" })).toEqual({
      ok: false,
      reason: "not_on_allowlist"
    })
  })

  it("knows the stages without a bypass: staging and production", () => {
    expect([on("local"), on("preview"), on("staging"), on("production")]).toEqual([true, true, false, false])
  })

  it("never lets the dev header stand in for a JWT that fails", async () => {
    const forged = await sign(good, { key: stranger.privateKey })
    expect(await admit({ ...base, dev: true, jwt: forged, devStaff: "staff@example.com" })).toEqual({
      ok: false,
      reason: "signature"
    })
  })
})

describe("the team's keys", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("are fetched with options the Workers runtime takes", async () => {
    // The request is built as the runtime would build it: it throws a TypeError on an option it does not take (a
    // `redirect: "error"` once refused every staff login on staging as `unknown_key`).
    const asked: Array<Request> = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      asked.push(new Request(input, init))
      return Response.json({ keys: [teamKey] })
    })
    const issuer = issuerOf("keys-test.cloudflareaccess.com")
    expect(await accessKeys(issuer)(true)).toEqual([teamKey])
    expect(asked.map((r) => r.url)).toEqual([`${issuer}/cdn-cgi/access/certs`])
  })

  it("are none when Access answers with a redirect instead of them", async () => {
    const asked: Array<Request> = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      asked.push(new Request(input, init))
      return new Response(null, { status: 302, headers: { location: "https://elsewhere.example/certs" } })
    })
    expect(await accessKeys(issuerOf("redirect-test.cloudflareaccess.com"))(true)).toEqual([])
    expect(asked).toHaveLength(1)
  })
})
