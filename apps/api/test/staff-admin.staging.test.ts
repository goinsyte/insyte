import { describe, expect, it } from "vitest"
import { call } from "./support.ts"

/*
 * The staff admin on a Worker configured as staging (M18): the allowlist holds the address, but there is no bypass.
 * The dev header is nothing there, and a JWT is only Access's when it verifies (it cannot, unconfigured); every path
 * under the prefix answers 403 before any route runs.
 */

const PATHS = [
  ["GET", "/api/__admin"],
  ["GET", "/api/__admin/me"],
  ["GET", "/api/__admin/workspaces?q=insyte"],
  ["GET", "/api/__admin/workspaces/ws_00000000000000000000000000/health"],
  ["POST", "/api/__admin/sessions"],
  ["POST", "/api/__admin/sessions/sts_x/read"],
  ["POST", "/api/__admin/sessions/sts_x/end"]
] as const

describe("the staff admin on staging", () => {
  it.each(PATHS)("refuses %s %s with the dev header", async (method, path) => {
    const response = await call(`http://api.test${path}`, {
      method,
      headers: {
        "x-insyte-dev-staff": "staff@example.com",
        "x-insyte-staff": "1",
        ...(method === "POST" ? { "content-type": "application/json" } : {})
      },
      ...(method === "POST" ? { body: JSON.stringify({ workspaceId: "ws_x", reason: "test", rpc: "Team.get" }) } : {})
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: { code: "forbidden" } })
  })

  it("refuses a header that merely looks like Access's JWT", async () => {
    const fake = `${btoa(JSON.stringify({ alg: "RS256", kid: "k" }))}.${
      btoa(JSON.stringify({ email: "staff@example.com", aud: ["x"], exp: 9_999_999_999 }))
    }.c2ln`
    const response = await call("http://api.test/api/__admin/me", { headers: { "cf-access-jwt-assertion": fake } })
    expect(response.status).toBe(403)
  })
})
