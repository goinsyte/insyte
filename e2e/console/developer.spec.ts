import { type APIRequestContext, expect } from "@playwright/test"
import { founded, hydrated, test } from "./founder.ts"

/*
 * The developer's journey (M19, `@developer`): a key made in Instellingen → API-sleutels lists the team over `/v1` as a
 * script would, and over MCP as a client would; revoked, both are refused at once with a 401.
 *
 * The calls go to the address Agents en MCP shows, the API Worker's own hostname: not behind Access (a script carries
 * no Access token), so they are sent without it, and follow no redirect. Locally that address is a name no request
 * reaches (`PUBLIC_API_HOST` in `apps/api/wrangler.jsonc`): the console's part runs and the calls are skipped; the
 * worker tests (`public-api.worker.test.ts`, `mcp.worker.test.ts`) cover them there.
 */

// A JSON-RPC answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const VERSION = "2026-07-28"

/** One MCP call, stateless: the protocol's version and the method in the headers, the answer as JSON or a stream. */
async function mcp(api: APIRequestContext, url: string, token: string, tool: string) {
  const response = await api.post(url, {
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": VERSION,
      "Mcp-Method": "tools/call",
      "Mcp-Name": tool,
      authorization: `Bearer ${token}`
    },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: tool,
        arguments: {},
        _meta: {
          "io.modelcontextprotocol/protocolVersion": VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "insyte-e2e", version: "1.0.0" }
        }
      }
    }
  })
  const text = await response.text()
  if (response.status() !== 200) return { status: response.status(), message: undefined }
  const message: Json = response.headers()["content-type"]?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  return { status: 200, message }
}

test("@developer a key made in Instellingen lists the team over /v1 and MCP, and once revoked neither answers", async ({ page, request, playwright }) => {
  test.setTimeout(180_000)
  const { email } = await founded(page, request, { name: "Daan Developer", tag: "developer" })

  // The address a client is given: Agents en MCP shows the MCP server's; the REST API is beside it.
  await page.goto("/settings/agents")
  const shown = page.getByText(/^https:\/\/.+\/mcp$/)
  await expect(shown).toBeVisible()
  const mcpUrl = (await shown.textContent())!.trim()
  const members = mcpUrl.replace(/\/mcp$/, "/v1/members")
  const reachable = !new URL(mcpUrl).hostname.endsWith(".test")

  // A key with the role Alleen lezen (the dialog's default), which sees who is in the team; its secret once.
  await page.goto("/settings/api-keys")
  await hydrated(page)
  const making = page.getByRole("dialog")
  // A click before the page has hydrated opens nothing: try until the dialog is there.
  await expect(async () => {
    await page.getByRole("button", { name: "Sleutel aanmaken" }).first().click()
    await expect(making).toBeVisible({ timeout: 2_000 })
  }).toPass()
  await making.getByPlaceholder("Voorraadfeed magazijn").fill("Teamoverzicht")
  await making.getByRole("button", { name: "Sleutel aanmaken" }).click()
  await expect(making.getByRole("heading", { name: "Teamoverzicht is klaar" })).toBeVisible()
  const secret = (await making.getByText(/^ins_live_\w+_\w+$/).textContent())!.trim()
  await making.getByText("Ik heb hem opgeslagen").click()
  await making.getByRole("button", { name: "Klaar" }).click()
  await expect(making).toHaveCount(0)

  // A script and an MCP client with that key: the founder is the team.
  const api = await playwright.request.newContext({ maxRedirects: 0 })
  try {
    if (reachable) {
      const listed = await api.get(members, { headers: { authorization: `Bearer ${secret}` } })
      expect(listed.status(), "GET /v1/members").toBe(200)
      expect((await listed.json() as Json).data).toEqual([expect.objectContaining({ email, status: "active" })])
      const called = await mcp(api, mcpUrl, secret, "list_members")
      expect(called.status, "MCP list_members").toBe(200)
      expect(called.message.result.isError).toBe(false)
      expect(JSON.parse(called.message.result.content[0].text).data).toEqual([expect.objectContaining({ email })])
    } else {
      test.info().annotations.push({ type: "skipped", description: `${mcpUrl} is not reachable from here` })
    }

    // Revoked from its detail.
    await page.getByRole("button", { name: /Teamoverzicht/ }).click()
    const detail = page.getByRole("dialog")
    await detail.getByRole("button", { name: "Intrekken" }).click()
    await expect(page.getByText("Teamoverzicht ingetrokken")).toBeVisible()

    // Revoked is refused at once, on both doors.
    if (reachable) {
      const refused = await api.get(members, { headers: { authorization: `Bearer ${secret}` } })
      expect(refused.status(), "GET /v1/members once revoked").toBe(401)
      expect((await refused.json() as Json).error).toMatchObject({ reason: "revoked" })
      expect((await mcp(api, mcpUrl, secret, "list_members")).status, "MCP once revoked").toBe(401)
    }
  } finally {
    await api.dispose()
  }
})
