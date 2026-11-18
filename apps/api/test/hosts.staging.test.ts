import { RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import api from "../src/Main.ts"

/*
 * The hosts the API Worker answers on, configured as staging (`vitest.staging.config.ts`): the console's origin
 * (`CONSOLE_ORIGIN`, `http://localhost:4300` here) for everything, its own public host (`PUBLIC_API_HOST`) for the
 * public paths only, and nothing else. A version's preview URL is not behind Access, so it gets the 404 whatever the
 * path, the public ones included. Through `Main.ts` itself, as a deployed stage runs it: `Local.ts` hands the public
 * paths to the public Worker before this check.
 */

const fetchMain = async (input: string, init?: RequestInit): Promise<Response> => {
  const ctx = createExecutionContext()
  const response = await api.fetch(new Request(input, init) as Request<unknown, IncomingRequestCfProperties>, env, ctx)
  const body = await response.arrayBuffer()
  await waitOnExecutionContext(ctx)
  return new Response(body, response)
}

const NOT_FOUND = { error: { code: "not_found" } }

const CONSOLE = "http://localhost:4300"
const PUBLIC = "http://api.public.test"
const PREVIEW = "https://1a2b3c4d-insyte-api-staging.ishak-73d.workers.dev"

describe("the API Worker's hosts on staging", () => {
  it("serves the console's origin", async () => {
    const response = await fetchMain(`${CONSOLE}/api/config`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ signInProviders: expect.any(Array) })
  })

  it("serves a webhook on the public host", async () => {
    // Unsigned, so Stripe's receiver refuses it: what matters is that it, and not the host check, answered.
    const response = await fetchMain(`${PUBLIC}/hooks/stripe`, { method: "POST", body: "{}" })
    expect(response.status).not.toBe(404)
  })

  it("refuses the app on the public host", async () => {
    const response = await fetchMain(`${PUBLIC}/api/config`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND)
  })

  it.each([
    ["GET", "/api/config"],
    ["GET", "/api/auth/get-session"],
    ["POST", RPC_PATH],
    ["GET", "/api/__dev/mail"],
    ["GET", "/v1/orders"],
    ["POST", "/mcp"],
    ["POST", "/hooks/stripe"]
  ])("refuses %s %s on a version preview URL", async (method, path) => {
    const response = await fetchMain(`${PREVIEW}${path}`, method === "GET" ? {} : { method, body: "{}" })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual(NOT_FOUND)
  })

  it("refuses the console's host on another scheme", async () => {
    const response = await fetchMain(`https://localhost:4300/api/config`)
    expect(response.status).toBe(404)
  })
})
