import { describe, expect, it } from "vitest"
import { ok, person } from "./journeys.ts"
import { call, rpc } from "./support.ts"

/*
 * The MCP server (step 6.3, M19.3): an agent with an API key lists the tools and calls them with the key's scopes over
 * Streamable HTTP (2026-07-28, sessionless); without a valid key it gets a 401 before any JSON-RPC. Each call lands in
 * the key's request log, as the REST API's do.
 */

// A JSON-RPC answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"
const VERSION = "2026-07-28"

const meta = {
  "io.modelcontextprotocol/protocolVersion": VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
}

let id = 0

/** One JSON-RPC request to `/mcp`, its answer read from JSON or from the event stream. */
const mcp = async (token: string | undefined, method: string, params: Record<string, unknown> = {}) => {
  const response = await call(`${HOST}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": VERSION,
      "Mcp-Method": method,
      ...(typeof params["name"] === "string" ? { "Mcp-Name": params["name"] } : {}),
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` })
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: { ...params, _meta: meta } })
  })
  const text = await response.text()
  if (response.status !== 200) return { status: response.status, message: JSON.parse(text) as Json }
  const json = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  return { status: response.status, message: json as Json }
}

const content = (message: Json) => JSON.parse(message.result.content[0].text)

describe("the MCP server", () => {
  let owner = { email: "", cookie: "" }
  let agent = { id: "", secret: "" }
  let narrow = ""

  it("lists the tools to an agent's key", async () => {
    owner = await person("mcp-owner", "Agenten B.V.")
    const made = ok(
      await rpc("ApiKeys.create", {
        label: "Claude",
        access: { kind: "role", roleId: "view" },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: true
      }, owner.cookie)
    )
    agent = { id: made.key.id, secret: made.secret }
    narrow = ok(
      await rpc("ApiKeys.create", {
        label: "Alleen bestellingen",
        access: { kind: "custom", scopes: { orders: 1 } },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: true
      }, owner.cookie)
    ).secret

    const listed = await mcp(agent.secret, "tools/list")
    expect(listed.status).toBe(200)
    const tools = listed.message.result.tools as Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>
    expect(tools.map((t) => t.name).toSorted()).toEqual([
      "add_return_tracking",
      "approve_return",
      "cancel_order",
      "forward_orders",
      "get_order",
      "get_order_tracking",
      "get_return",
      "inspect_return",
      "list_customers",
      "list_forwarding",
      "list_members",
      "list_orders",
      "list_products",
      "list_returns",
      "list_roles",
      "list_suppliers",
      "receive_return",
      "refund_order",
      "reject_return",
      "reroute_leg",
      "resolve_return",
      "send_return_label",
      "set_order_note",
      "start_return",
      "tag_order",
      "update_shipping_address",
      "whoami"
    ])
    // The reads say they only read; cancelling and refunding say they cannot be taken back (M7).
    const hints = Object.fromEntries(tools.map((t) => [t.name, t.annotations as Record<string, boolean> | undefined]))
    for (
      const read of [
        "whoami",
        "list_members",
        "list_roles",
        "list_orders",
        "list_products",
        "list_customers",
        "get_order",
        "get_order_tracking",
        "list_suppliers",
        "list_forwarding",
        "list_returns",
        "get_return"
      ]
    ) {
      expect(hints[read]?.["readOnlyHint"]).toBe(true)
    }
    expect(hints["cancel_order"]?.["destructiveHint"]).toBe(true)
    expect(hints["refund_order"]?.["destructiveHint"]).toBe(true)
    expect(hints["forward_orders"]?.["destructiveHint"]).toBe(true)
    expect(hints["resolve_return"]?.["destructiveHint"]).toBe(true)
    expect(hints["send_return_label"]?.["destructiveHint"]).toBe(true)
  })

  it("answers whoami, list_members and list_roles as the key", async () => {
    const me = await mcp(agent.secret, "tools/call", { name: "whoami", arguments: {} })
    expect(me.message.result.isError).toBe(false)
    expect(content(me.message)).toMatchObject({
      key: { id: agent.id, label: "Claude" },
      workspace: { name: "Agenten B.V." }
    })

    const members = await mcp(agent.secret, "tools/call", { name: "list_members", arguments: {} })
    expect(content(members.message).data).toEqual([expect.objectContaining({ email: owner.email, status: "active" })])

    const roles = await mcp(agent.secret, "tools/call", { name: "list_roles", arguments: {} })
    expect(content(roles.message).data.map((r: { id: string }) => r.id)).toContain("view")
  })

  it("returns a tool error when the key lacks the scope", async () => {
    const refused = await mcp(narrow, "tools/call", { name: "list_members", arguments: {} })
    expect(refused.message.result.isError).toBe(true)
    expect(JSON.stringify(refused.message.result.content)).toContain("team.read")
  })

  it("turns away a request without a valid key with a 401 before any JSON-RPC", async () => {
    const none = await mcp(undefined, "tools/list")
    expect(none.status).toBe(401)
    expect(none.message).toMatchObject({ error: { code: "UnauthorizedV1", reason: "missing" } })
    expect((await mcp("ins_live_nope", "tools/list")).message.error.reason).toBe("malformed")
  })

  it("logs each MCP call in the key's activity", async () => {
    const activity = ok(await rpc("ApiKeys.activity", { id: agent.id }, owner.cookie))
    expect(activity.requests.filter((r) => r.path === "/mcp").length).toBeGreaterThanOrEqual(4)
  })
})
