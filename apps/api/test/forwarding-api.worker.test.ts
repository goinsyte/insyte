import { describe, expect, it } from "vitest"
import { ok, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Forwarding through the public API and MCP (step 10.2c, M8.2 with M19): a key reads the suppliers and the queue,
 * forwards legs once per Idempotency-Key and moves a leg to another supplier, with its scopes; a key that may only look
 * is refused. The same, as MCP tools.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"

const send = async (
  method: string,
  path: string,
  token: string,
  body?: unknown,
  key: string | undefined = method === "GET" ? undefined : crypto.randomUUID()
) => {
  const response = await call(`${HOST}/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(key === undefined ? {} : { "idempotency-key": key })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  return { status: response.status, body: await response.json() as Json }
}
const mcpCall = async (token: string, name: string, args: Record<string, unknown>) => {
  const response = await call(`${HOST}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
        }
      }
    })
  })
  const text = await response.text()
  const message = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  return { isError: message.result.isError as boolean, value: JSON.parse(message.result.content[0].text) as Json }
}

describe("forwarding through the public API and MCP", () => {
  it("reads the queue and the suppliers, reroutes and forwards once per key, and refuses a key that only looks", async () => {
    const store = await importedStore("v1-forwarding")
    const make = async (label: string, roleId: string) =>
      ok(
        await rpc("ApiKeys.create", {
          label,
          access: { kind: "role", roleId } as never,
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent: false
        }, store.cookie)
      ).secret
    const service = await make("Klantenservice", "service")
    const agent = await make("Klantenservice agent", "service")
    const viewer = await make("Alleen kijken", "view")
    ok(
      await rpc("Suppliers.create", {
        name: "Tassen & Co",
        contactEmail: `tassen-${run}@supplier.example`,
        contactPhone: "",
        description: ""
      }, store.cookie)
    )

    const suppliers = await send("GET", "/suppliers", service)
    expect(suppliers.status).toBe(200)
    expect(suppliers.body.data.map((s: Json) => [s.name, s.paused, s.forward_channel])).toEqual([
      ["Atelier Noord", false, "email"],
      ["Tassen & Co", false, "email"],
      ["Wolhuis", false, "email"]
    ])
    const tassen = suppliers.body.data.find((s: Json) => s.name === "Tassen & Co")

    const queue = await send("GET", "/forwarding?view=to_forward", service)
    expect(queue).toMatchObject({
      status: 200,
      body: { counts: { to_forward: 1, awaiting: 0, late: 0, error: 0 } }
    })
    const leg = queue.body.data[0]
    expect(leg).toMatchObject({
      order: { number: "#1001" },
      supplier: { name: "Atelier Noord" },
      lines: [{ title: "Linnen overhemd", quantity: 1 }],
      state: "to_forward",
      error: null
    })

    // Moved to Tassen & Co: to forward there, with where it came from.
    expect(await send("POST", `/forwarding/${leg.id}/reroute`, service, { supplier_id: tassen.id })).toMatchObject({
      status: 200,
      body: { supplier: { name: "Tassen & Co" }, from_supplier: { name: "Atelier Noord" }, state: "to_forward" }
    })
    expect(await send("POST", `/forwarding/${leg.id}/reroute`, service, { supplier_id: tassen.id })).toMatchObject({
      status: 409,
      body: { error: { code: "ConflictV1", reason: "same_supplier" } }
    })

    // A key that may only look cannot forward; one that may forwards, once per key.
    expect(await send("POST", "/forwarding/forward", viewer, { leg_ids: [leg.id] })).toMatchObject({
      status: 403,
      body: { error: { code: "ScopeMissingV1", scope: "orders.write" } }
    })
    expect(await send("POST", "/forwarding/forward", service, { leg_ids: [leg.id] }, "")).toMatchObject({
      status: 400,
      body: { error: { code: "InvalidRequestV1", field: "idempotency-key" } }
    })
    const forwarded = await send(
      "POST",
      "/forwarding/forward",
      service,
      { leg_ids: [leg.id], note: "Snel graag" },
      "fw-1"
    )
    expect(forwarded).toMatchObject({ status: 200, body: { data: [{ id: leg.id, state: "sending", via: "email" }] } })
    expect(await send("POST", "/forwarding/forward", service, { leg_ids: [leg.id], note: "Snel graag" }, "fw-1"))
      .toEqual(forwarded)
    expect(await send("POST", `/forwarding/${leg.id}/reroute`, service, { supplier_id: tassen.id })).toMatchObject({
      status: 409,
      body: { error: { code: "ConflictV1", reason: "already_sent" } }
    })

    // The same as MCP tools.
    const listed = await mcpCall(agent, "list_forwarding", { view: "awaiting" })
    expect(listed).toMatchObject({ isError: false, value: { data: [{ id: leg.id, state: "sending" }] } })
    const people = await mcpCall(agent, "list_suppliers", {})
    expect(people.value.data).toHaveLength(3)
    const again = await mcpCall(agent, "forward_orders", { leg_ids: [leg.id], idempotency_key: "fw-mcp" })
    expect(again).toMatchObject({ isError: false, value: { data: [] } })
  })
})
