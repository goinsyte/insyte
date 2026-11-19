import { describe, expect, it } from "vitest"
import { call, health } from "./support.ts"

describe("the API Worker", () => {
  it("answers GET /api/health with what runs where, through Hyperdrive to Postgres", async () => {
    const response = await call("http://api.test/api/health")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ version: "dev", environment: "local", db: "ok" })
  })

  it("proves on GET /api/health/deep that it connects as insyte_app, without BYPASSRLS", async () => {
    const response = await call("http://api.test/api/health/deep")
    const body = (await response.json()) as { deadLetters?: { lastAt: unknown } }
    // The latest dead letter's time, when there is one.
    expect(body.deadLetters?.lastAt === null || typeof body.deadLetters?.lastAt === "string").toBe(true)
    expect({ ...body, deadLetters: { ...body.deadLetters, lastAt: null } }).toEqual({
      ok: true,
      role: "insyte_app",
      bypassesRls: false,
      migratedTo: expect.stringMatching(/^\d{4}_[a-z_]+$/),
      // The outbox rows that wait on someone (dead letters, rows held back), counted across workspaces.
      outbox: { deadLettered: expect.any(Number), held: expect.any(Number) },
      privacy: {
        redactsOpen: expect.any(Number),
        redactsFailed: expect.any(Number),
        redactsOverdue: expect.any(Number)
      },
      // The messages the queues gave up on (W13.6), written down by the jobs Worker's dead-letter consumer.
      deadLetters: { events: expect.any(Number), ingest: expect.any(Number), lastDay: expect.any(Number), lastAt: null }
    })
  })

  it("gives every response its trace id as Insyte-Request-Id", async () => {
    const response = await call("http://api.test/api/health")
    expect(response.headers.get("insyte-request-id")).toMatch(/^[0-9a-f]{32}$/)
  })

  it("continues a trace the caller started", async () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736"
    const response = await call("http://api.test/api/health", {
      headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` }
    })
    expect(response.headers.get("insyte-request-id")).toBe(traceId)
  })

  it("answers GET /api/config with public settings only", async () => {
    const response = await call("http://api.test/api/config")
    expect(await response.json()).toEqual({
      turnstileSiteKey: "1x00000000000000000000AA",
      sentryDsn: "",
      signInProviders: ["password"],
      flags: {}
    })
  })

  it("answers an unknown path with a 404 JSON envelope", async () => {
    const response = await call("http://api.test/api/nope")
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: { code: "not_found" } })
  })

  it("serves System.health over RPC to the console's client", async () => {
    expect(await health()).toMatchObject({
      version: "dev",
      environment: "local",
      database: "ok",
      migratedTo: expect.stringMatching(/^\d{4}_[a-z_]+$/)
    })
  })
})
