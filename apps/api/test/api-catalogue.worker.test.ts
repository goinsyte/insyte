import { describe, expect, it } from "vitest"
import { ok, person } from "./journeys.ts"
import { call, rpc } from "./support.ts"

/*
 * The public API's and the MCP server's catalogues as committed snapshots (M19.2, M19.3; ADR-0024): `/v1/openapi.json`
 * as the Worker serves it, and every tool (name, description, input and output schema, hints) and resource as
 * `tools/list` and `resources/list` name them to a key that may do everything a key may. A change to either shows in
 * review as a diff of `snapshots/`, and fails CI until the snapshot is updated in the same change:
 *
 *   bunx vitest run --project api-worker test/api-catalogue.worker.test.ts -u
 *
 * `/v1` is dated and frozen: only additions belong in its diff. An MCP tool may be added freely; renaming or removing
 * one is a breaking change for the changelog.
 */

// A JSON-RPC answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"
const VERSION = "2026-07-28"

const mcp = async (token: string, method: string): Promise<Json> => {
  const response = await call(`${HOST}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": VERSION,
      "Mcp-Method": method,
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
        }
      }
    })
  })
  const text = await response.text()
  return response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
}

/** Stable text for a snapshot: two spaces, a closing newline. */
const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

const byName = <A extends { readonly name: string }>(items: ReadonlyArray<A>) =>
  items.toSorted((a, b) => a.name.localeCompare(b.name))

describe("the public catalogues", () => {
  it("serves /v1/openapi.json as the snapshot has it", async () => {
    const response = await call(`${HOST}/v1/openapi.json`)
    expect(response.status).toBe(200)
    await expect(pretty(await response.json())).toMatchFileSnapshot("./snapshots/openapi.v1.json")
  })

  it("names the MCP tools and resources as the snapshot has them", async () => {
    const owner = await person("catalogue-owner", "Catalogus B.V.")
    const key = ok(
      await rpc("ApiKeys.create", {
        label: "Alles",
        access: { kind: "role", roleId: "admin" },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, owner.cookie)
    ).secret
    const tools = (await mcp(key, "tools/list")).result.tools as Array<{ name: string }>
    const resources = (await mcp(key, "resources/list")).result.resources as Array<{ name: string }>
    const templates = (await mcp(key, "resources/templates/list")).result.resourceTemplates as Array<{ name: string }>
    await expect(pretty({ tools: byName(tools), resources: byName(resources), resourceTemplates: byName(templates) }))
      .toMatchFileSnapshot("./snapshots/mcp-catalogue.json")
  })
})
