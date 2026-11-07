import { describe, expect, it } from "vitest"
import { call, health } from "./support.ts"

describe("the API Worker", () => {
  it("answers GET /api/health with what runs where", async () => {
    const response = await call("http://api.test/api/health")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ version: "dev", environment: "local" })
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
      signInProviders: [],
      flags: {}
    })
  })

  it("answers an unknown path with a 404 JSON envelope", async () => {
    const response = await call("http://api.test/api/nope")
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: { code: "not_found" } })
  })

  it("serves System.health over RPC to the console's client", async () => {
    expect(await health()).toMatchObject({ version: "dev", environment: "local" })
  })
})
