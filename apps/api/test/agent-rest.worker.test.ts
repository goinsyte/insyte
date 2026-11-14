import { describe, expect, it } from "vitest"
import { ok } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * An agent's key on `/v1` (ADR-0027): it reads as any key does, and every write is refused before the endpoint runs,
 * since its writes go through MCP, where the workspace's autonomy rules decide. The same role on a key without the
 * agent flag does each write. Every write the OpenAPI document lists is tried, so a write added later is held too.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"

// Each key's rate is 10 a second: the calls of one key here go one at a time, a little apart.
const pause = () => new Promise((resolve) => setTimeout(resolve, 120))

const send = async (method: string, path: string, token: string, body?: unknown) => {
  await pause()
  const response = await call(`${HOST}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(method === "GET" ? {} : { "idempotency-key": crypto.randomUUID() }),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  return { status: response.status, body: await response.json() as Json }
}

const refused = (method: string, path: string) => ({
  status: 403,
  body: { error: { code: "ActionNotAllowedV1", action: `${method} ${path}`, reason: "use_mcp" } }
})

describe("an agent's key on /v1", () => {
  it("reads, is refused every write, and the same role without the agent flag writes", async () => {
    const store = await importedStore("agent-rest")
    const key = async (label: string, agent: boolean) =>
      ok(
        await rpc("ApiKeys.create", {
          label,
          // Klantenservice: Bestellingen · Bewerken, Terugbetalen up to €100.
          access: { kind: "role", roleId: "service" } as never,
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent
        }, store.cookie)
      ).secret
    const agent = await key("Agent", true)
    const person = await key("Klantenservice", false)

    // It reads.
    const listed = await send("GET", "/v1/orders?q=1001", agent)
    expect(listed.status).toBe(200)
    const order = listed.body.data[0]
    expect(order).toMatchObject({ number: "#1001" })
    const path = `/v1/orders/${order.id}`

    // Refund, cancel, delay and its clearing: refused, and the order is as it was.
    expect(await send("POST", `${path}/refunds`, agent, { amount_minor: 1000 })).toMatchObject(
      refused("POST", "/v1/orders/:id/refunds")
    )
    expect(await send("POST", `${path}/cancel`, agent, { restock: true, notify_customer: false })).toMatchObject(
      refused("POST", "/v1/orders/:id/cancel")
    )
    expect(await send("POST", `${path}/delay`, agent)).toMatchObject(refused("POST", "/v1/orders/:id/delay"))
    expect(await send("DELETE", `${path}/delay`, agent)).toMatchObject(refused("DELETE", "/v1/orders/:id/delay"))
    const untouched = await send("GET", path, agent)
    expect(untouched.status).toBe(200)
    expect(untouched.body.status).not.toBe("cancelled")
    expect(untouched.body.refunds).toEqual([])
    expect(untouched.body.tags).not.toContain("at_risk")

    // Every other write the API lists, refused before its body is read; each documents the refusal.
    const spec = await (await call(`${HOST}/v1/openapi.json`)).json() as Json
    const writes = Object.entries(spec.paths as Record<string, Record<string, Json>>).flatMap(([route, methods]) =>
      Object.entries(methods)
        .filter(([method]) => ["post", "put", "patch", "delete"].includes(method))
        .map(([method, operation]) => ({ method: method.toUpperCase(), route, operation }))
    )
    expect(writes.length).toBeGreaterThanOrEqual(25)
    // Filing a plate runs its action as the key: over MCP an agent's key is refused it, and here too.
    expect(writes.map((w) => `${w.method} ${w.route}`)).toContain("POST /v1/proposals/{id}/file")
    for (const { method, operation, route } of writes) {
      expect(JSON.stringify(operation.responses["403"]), `${method} ${route}`).toContain("ActionNotAllowedV1")
      const answer = await send(method, route.replaceAll(/\{[^}]+\}/g, "x_none"), agent, {})
      expect(answer, `${method} ${route}`).toMatchObject(refused(method, route.replaceAll(/\{([^}]+)\}/g, ":$1")))
    }

    // The same role on a key without the agent flag: delay, clear it, refund and cancel.
    expect((await send("POST", `${path}/delay`, person)).status).toBe(200)
    expect((await send("DELETE", `${path}/delay`, person)).status).toBe(200)
    expect(await send("POST", `${path}/refunds`, person, { amount_minor: 1000 })).toMatchObject({
      status: 200,
      body: { order_id: order.id, amount: { amount_minor: 1000 } }
    })
    expect(await send("POST", `${path}/cancel`, person, { restock: true, notify_customer: false })).toMatchObject({
      status: 200,
      body: { status: "cancelled" }
    })
  })
})
