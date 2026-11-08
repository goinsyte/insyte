import { describe, expect, it } from "vitest"
import { ok, person } from "./journeys.ts"
import { call, rpc } from "./support.ts"

/*
 * The public API (step 6.2, M19.2): a bearer key reads what its access allows under `/v1`, is turned away with a
 * reason when it is wrong, revoked or used from elsewhere, and every call it makes lands in its request log. On the
 * Worker's own hostname nothing but `/v1` answers.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"

const v1 = (path: string, token?: string, headers: Record<string, string> = {}) =>
  call(`${HOST}/v1${path}`, {
    headers: { ...(token === undefined ? {} : { authorization: `Bearer ${token}` }), ...headers }
  })

const json = async (response: Response) => ({ status: response.status, body: await response.json() as Json })

describe("the public API", () => {
  let owner = { email: "", cookie: "" }
  let read = { id: "", secret: "" }
  let none = { id: "", secret: "" }

  it("answers /v1/me with the key's scopes and workspace", async () => {
    owner = await person("v1-owner", "Publiek B.V.")
    const make = async (label: string, access: unknown, ips: Array<string> = []) => {
      const made = ok(
        await rpc("ApiKeys.create", {
          label,
          access: access as never,
          stores: "all",
          expiresInDays: 30,
          ips,
          agent: false
        }, owner.cookie)
      )
      return { id: made.key.id, secret: made.secret }
    }
    read = await make("Leesrechten", { kind: "role", roleId: "view" })
    none = await make("Alleen bestellingen", { kind: "custom", scopes: { orders: 1 } })

    const answered = await v1("/me", read.secret)
    expect(answered.headers.get("insyte-request-id")).toMatch(/^[0-9a-f]{32}$/)
    const me = await json(answered)
    expect(me.status).toBe(200)
    expect(me.body).toMatchObject({
      key: { id: read.id, label: "Leesrechten" },
      workspace: { name: "Publiek B.V." }
    })
    expect(me.body.key.scopes).toContain("team.read")
    expect(me.body.key.scopes).not.toContain("team.write")
  })

  it("lists members and roles for a key with team.read, and refuses one without", async () => {
    const members = await json(await v1("/members", read.secret))
    expect(members.status).toBe(200)
    expect(members.body.data).toEqual([
      expect.objectContaining({
        email: owner.email,
        role: { id: "owner", label: expect.any(String) },
        status: "active"
      })
    ])
    const roles = await json(await v1("/roles", read.secret))
    expect(roles.status).toBe(200)
    expect(roles.body.data.map((r: { id: string }) => r.id)).toEqual(["owner", "admin", "service", "finance", "view"])
    expect(roles.body.data[0].access.team).toBe("manage")

    const refused = await json(await v1("/members", none.secret))
    expect(refused).toMatchObject({
      status: 403,
      body: { error: { code: "ScopeMissingV1", scope: "team.read", message: "This key lacks team.read." } }
    })
  })

  it("turns away a missing, wrong, revoked or out-of-range key with a reason", async () => {
    const missing = await v1("/me")
    expect(missing.status).toBe(401)
    expect(missing.headers.get("www-authenticate")).toContain("Bearer")
    const body = (await missing.json() as Json).error
    expect(body).toMatchObject({ code: "UnauthorizedV1", reason: "missing" })
    expect(missing.headers.get("insyte-request-id")).toBe(body.request_id)
    expect((await json(await v1("/me", "ins_live_nope"))).body.error).toMatchObject({ reason: "malformed" })
    const wrong = `${read.secret.slice(0, -4)}${read.secret.endsWith("AAAA") ? "BBBB" : "AAAA"}`
    expect((await json(await v1("/me", wrong))).body.error).toMatchObject({ code: "UnauthorizedV1", reason: "unknown" })

    ok(await rpc("ApiKeys.revoke", { id: none.id }, owner.cookie))
    expect((await json(await v1("/me", none.secret))).body.error).toMatchObject({ reason: "revoked" })

    const fenced = ok(
      await rpc("ApiKeys.create", {
        label: "Kantoor",
        access: { kind: "role", roleId: "view" },
        stores: "all",
        expiresInDays: 30,
        ips: ["203.0.113.0/24"],
        agent: false
      }, owner.cookie)
    )
    expect((await v1("/me", fenced.secret, { "cf-connecting-ip": "203.0.113.9" })).status).toBe(200)
    expect(await json(await v1("/me", fenced.secret, { "cf-connecting-ip": "198.51.100.1" }))).toMatchObject({
      status: 403,
      body: { error: { code: "IpNotAllowedV1" } }
    })
  })

  it("keeps the old token working through a rotation's grace, then only the new one", async () => {
    const rotated = ok(await rpc("ApiKeys.rotate", { id: read.id, graceMs: 3_600_000 }, owner.cookie))
    expect((await v1("/me", read.secret)).status).toBe(200)
    expect((await v1("/me", rotated.secret)).status).toBe(200)
    ok(await rpc("ApiKeys.endGrace", { id: read.id }, owner.cookie))
    expect((await json(await v1("/me", read.secret))).body.error).toMatchObject({ reason: "unknown" })
    read = { id: read.id, secret: rotated.secret }
  })

  it("holds a key to ten calls a second, with retry_after", async () => {
    const burst = ok(
      await rpc("ApiKeys.create", {
        label: "Haastig",
        access: { kind: "role", roleId: "view" },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, owner.cookie)
    ).secret
    // At once, so they land inside one second even on a busy runner.
    const answers = await Promise.all(Array.from({ length: 25 }, () => v1("/me", burst)))
    expect(answers.filter((r) => r.status === 200).length).toBeLessThanOrEqual(20)
    const limited = answers.find((r) => r.status === 429)
    expect(limited).toBeDefined()
    expect((await limited!.json() as Json).error).toMatchObject({
      code: "RateLimitedV1",
      retry_after: expect.any(Number)
    })
    expect(limited!.headers.get("retry-after")).not.toBeNull()
  })

  it("logs each call it answered in the key's activity", async () => {
    const activity = ok(await rpc("ApiKeys.activity", { id: read.id }, owner.cookie))
    expect(activity.requests.length).toBeGreaterThanOrEqual(4)
    expect(activity.requests[0]).toMatchObject({ method: "GET", path: "/v1/me", status: 200 })
    expect(activity.requests.map((r) => r.path)).toContain("/v1/members")
    expect(activity.usage.at(-1)!.count).toBeGreaterThanOrEqual(4)
  })

  it("publishes its OpenAPI document and reference, and nothing else on its own host", async () => {
    const spec = await json(await call(`${HOST}/v1/openapi.json`))
    expect(spec.status).toBe(200)
    expect(Object.keys(spec.body.paths)).toEqual(expect.arrayContaining(["/v1/me", "/v1/members", "/v1/roles"]))
    expect(JSON.stringify(spec.body.components.securitySchemes)).toContain("bearer")
    const docs = await call(`${HOST}/v1/docs`)
    expect(docs.status).toBe(200)
    expect(await docs.text()).toContain("scalar")

    expect((await call(`${HOST}/api/health`)).status).toBe(404)
    expect((await call(`${HOST}/api/auth/get-session`)).status).toBe(404)
    // On the console's binding the internal routes still answer.
    expect((await call("http://api.test/api/health")).status).toBe(200)
  })
})
