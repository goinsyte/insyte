import { describe, expect, it } from "vitest"
import { ok } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Returns through the public API and MCP (step 11.1, M9.1 with M19): a key starts a return once per Idempotency-Key,
 * takes it through approval, receipt and inspection, and settles it with a refund that Insyte asks once; a key that
 * may only look is refused, and a move the status does not allow is a conflict.
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

describe("returns through the public API and MCP", () => {
  it("takes a return to a refund once per key, and refuses a key that only looks", async () => {
    const store = await importedStore("v1-returns")
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
    const viewer = await make("Alleen kijken", "view")
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1002")!
    const line = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).lines[0]!
    const body = {
      order_id: order.id,
      lines: [{ line_id: line.id, quantity: 1 }],
      reason_id: "too_big",
      requested_resolution: "refund"
    }

    expect(await send("POST", "/returns", viewer, body)).toMatchObject({
      status: 403,
      body: { error: { code: "ScopeMissingV1", scope: "returns.write" } }
    })
    const key = crypto.randomUUID()
    const started = await send("POST", "/returns", service, body, key)
    expect(started).toMatchObject({
      status: 200,
      body: {
        kind: "return",
        status: "review",
        order: { number: "#1002" },
        reason: { id: "too_big", label: "Te groot" },
        amount: { amount_minor: line.unitPriceMinor },
        late: false,
        resolution: null
      }
    })
    // The same key again: the same return, not a second one.
    expect((await send("POST", "/returns", service, body, key)).body.id).toBe(started.body.id)
    const id = started.body.id

    const approved = await send("POST", `/returns/${id}/approve`, service, {})
    expect(approved.body, JSON.stringify(approved)).toMatchObject({ status: "awaiting_parcel" })
    expect(await send("POST", `/returns/${id}/approve`, service, {})).toMatchObject({
      status: 409,
      body: { error: { code: "ConflictV1", reason: "status_awaiting_parcel" } }
    })
    expect((await send("POST", `/returns/${id}/receive`, service)).body.status).toBe("received")
    expect((await send("POST", `/returns/${id}/inspect`, service, {})).body.status).toBe("ready")

    const one = await send("GET", `/returns/${id}`, viewer)
    expect(one.body.lines).toEqual([
      expect.objectContaining({ order_line_id: line.id, quantity: 1, condition: "ok" })
    ])
    expect(one.body.allowed_resolutions[0]).toEqual({ kind: "refund", amount_minor: line.unitPriceMinor })
    expect(await send("GET", "/returns/ret_none", viewer)).toMatchObject({
      status: 404,
      body: { error: { code: "NotFoundV1", message: "No such return in this key's stores." } }
    })

    // Settled by MCP with a refund, once per key.
    const resolved = await mcpCall(service, "resolve_return", {
      return_id: id,
      resolution: "refund",
      idempotency_key: "settle-1"
    })
    expect(resolved).toMatchObject({
      isError: false,
      value: { status: "resolved", resolution: { kind: "refund", amount_minor: line.unitPriceMinor } }
    })
    await mcpCall(service, "resolve_return", { return_id: id, resolution: "refund", idempotency_key: "settle-1" })
    expect(ok(await rpc("Orders.get", { id: order.id }, store.cookie)).refunds).toHaveLength(1)

    const listed = await mcpCall(viewer, "list_returns", { status: "resolved" })
    expect(listed.value.data.map((r: Json) => r.id)).toEqual([id])
    expect(listed.value.counts).toMatchObject({ total: 1, review: 0, ready: 0 })
  })
})
