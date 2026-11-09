import { describe, expect, it } from "vitest"
import { ok, outboxOf } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * The order commands through the public API and MCP (step 9, M7 with M19): a key acts on orders with its scopes, each
 * write once per `Idempotency-Key` (the same key and request answer the first result; the same key with another
 * request is refused), refunds within the role's limit (a key with its own scopes has no refund right), and the
 * same refusals as the console in their `…V1` envelopes.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"

const send = async (method: string, path: string, token: string, body?: unknown, key?: string) => {
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

describe("the order commands through the public API and MCP", () => {
  it("acts on an order with the key's scopes, once per Idempotency-Key, and refunds within the role's limit", async () => {
    const store = await importedStore("v1-orders")
    const make = async (label: string, access: unknown) =>
      ok(
        await rpc("ApiKeys.create", {
          label,
          access: access as never,
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent: false
        }, store.cookie)
      ).secret
    // Klantenservice: Bestellingen · Bewerken, Terugbetalen up to €100. One key per part, each under its 10 a second.
    const service = await make("Klantenservice", { kind: "role", roleId: "service" })
    const desk = await make("Klantenservice balie", { kind: "role", roleId: "service" })
    const agent = await make("Klantenservice agent", { kind: "role", roleId: "service" })
    const custom = await make("Eigen rechten", { kind: "custom", scopes: { orders: 2 } })
    const viewer = await make("Alleen kijken", { kind: "role", roleId: "view" })
    const order = (await send("GET", "/orders?q=1001", service)).body.data[0]

    const detail = await send("GET", `/orders/${order.id}`, service)
    expect(detail).toMatchObject({ status: 200, body: { number: "#1001", lines: [{ title: "Linnen overhemd" }] } })
    expect((await send("GET", "/orders/ord_none", service)).body.error.code).toBe("NotFoundV1")

    // Tags, once per key: the same request answers the first result and changes nothing more.
    const tagged = await send("POST", `/orders/${order.id}/tags`, service, { add: ["API"] }, "tag-1")
    expect(tagged).toMatchObject({ status: 200, body: { tags: ["api"] } })
    expect(await send("POST", `/orders/${order.id}/tags`, service, { add: ["API"] }, "tag-1")).toEqual(tagged)
    expect((await outboxOf(store.workspace)).filter((e) => e.event === "order.updated")).toHaveLength(1)
    expect(await send("POST", `/orders/${order.id}/tags`, service, { add: ["Anders"] }, "tag-1")).toMatchObject({
      status: 422,
      body: { error: { code: "IdempotencyKeyReusedV1" } }
    })
    expect(await send("POST", `/orders/${order.id}/tags`, service, { add: ["at_risk"] })).toMatchObject({
      status: 400,
      body: { error: { code: "ValidationFailedV1", fields: { tags: "system" } } }
    })
    expect(await send("POST", `/orders/${order.id}/tags`, viewer, { add: ["x"] })).toMatchObject({
      status: 403,
      body: { error: { code: "ScopeMissingV1", scope: "orders.write" } }
    })

    expect(await send("POST", `/orders/${order.id}/note`, desk, { body: "Belt om 17:00" })).toMatchObject({
      status: 200,
      body: { internal_note: "Belt om 17:00" }
    })
    const moved = await send("PATCH", `/orders/${order.id}/shipping_address`, desk, {
      line1: "Prinsengracht 263",
      city: "Amsterdam",
      postcode: "1016 GV",
      country: "NL"
    })
    expect(moved.status).toBe(200)
    expect((await send("GET", `/orders/${order.id}`, desk)).body.shipping_address).toMatchObject({
      line1: "Prinsengracht 263",
      country: "NL"
    })

    // Refunds: the role's limit holds, the key makes it once, and a key with its own scopes has no refund right.
    expect(await send("POST", `/orders/${order.id}/refunds`, desk, { amount_minor: 15000 })).toMatchObject({
      status: 422,
      body: { error: { code: "RefundOverLimitV1", limit_minor: 10000 } }
    })
    const refunded = await send("POST", `/orders/${order.id}/refunds`, desk, { amount_minor: 1000 }, "refund-1")
    expect(refunded).toMatchObject({
      status: 200,
      body: { order_id: order.id, amount: { amount_minor: 1000, currency: "EUR" }, status: "pending" }
    })
    expect(await send("POST", `/orders/${order.id}/refunds`, desk, { amount_minor: 1000 }, "refund-1")).toEqual(
      refunded
    )
    expect((await send("GET", `/orders/${order.id}`, desk)).body.refunds).toHaveLength(1)
    expect(await send("POST", `/orders/${order.id}/refunds`, custom, { amount_minor: 100 })).toMatchObject({
      status: 403,
      body: { error: { code: "ScopeMissingV1", scope: "refunds.write" } }
    })

    // Cancelling: once, and a second time is a conflict.
    const cancelled = await send("POST", `/orders/${order.id}/cancel`, agent, {
      restock: true,
      notify_customer: false
    }, "cancel-1")
    expect(cancelled).toMatchObject({ status: 200, body: { status: "cancelled" } })
    expect(await send("POST", `/orders/${order.id}/cancel`, agent, { restock: true, notify_customer: false }))
      .toMatchObject({ status: 409, body: { error: { code: "ConflictV1", reason: "closed" } } })

    // The same commands as MCP tools.
    const other = (await send("GET", "/orders?q=1002", agent)).body.data[0]
    const viaMcp = await mcpCall(agent, "tag_order", { order_id: other.id, add: ["Agent"] })
    expect(viaMcp).toMatchObject({ isError: false, value: { number: "#1002", tags: ["agent"] } })
    const noted = await mcpCall(agent, "set_order_note", { order_id: other.id, body: "Via de agent" })
    expect(noted.value.internal_note).toBe("Via de agent")
    const overLimit = await mcpCall(agent, "refund_order", { order_id: other.id, amount_minor: 50000 })
    expect(overLimit).toMatchObject({ isError: true, value: { error: { code: "RefundOverLimitV1" } } })
  })
})
