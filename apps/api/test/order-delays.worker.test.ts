import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Redacted } from "effect"
import { describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Delays an operator acts on, and the supplier's clock (M7, M8.3). "Als vertraagd markeren" marks open orders delayed
 * with one undo and, once the window has passed, tells the automations (`order.delayed`, `manual`) but neither the team
 * nor the shopper. "Vertraging wissen" takes it off with an undo. An order knows its suppliers from its legs; the
 * hourly check delays an order whose supplier is past the hand-off (in the last seven days), once, and tells whoever
 * handles orders in its store, not a member fenced to another; a delay cleared after the hand-off stays cleared until
 * the supplier names a later date and misses that too. An agent's key cannot mark or clear a delay over MCP.
 */

const orderNumbered = async (cookie: string, number: string) =>
  ok(await rpc("Orders.list", { limit: 50 }, cookie)).rows.find((o) => o.number === number)!

/** One turn of the hourly supplier check, as if at `at` (ms; now when absent). */
const supplierLate = async (workspace: string, at?: number) =>
  (await (await call(
    `http://api.test/api/__dev/orders/supplier-late?workspace=${workspace}${
      at === undefined ? "" : `&at=${new Date(at).toISOString()}`
    }`,
    { method: "POST" }
  )).json() as { outboxIds: Array<string> }).outboxIds

const HOUR = 3_600_000

const key = async (cookie: string, label: string, stores: "all" | Array<string>, agent: boolean) =>
  ok(
    await rpc("ApiKeys.create", {
      label: `${label} ${run}`,
      access: { kind: "role", roleId: "service" } as never,
      stores,
      expiresInDays: 30,
      ips: [],
      agent
    }, cookie)
  ).secret

// A JSON-RPC answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any
const MCP_VERSION = "2026-07-28"
let mcpId = 0

/** One MCP tool call with the key: whether it failed, and its body. */
const tool = async (token: string, name: string, args: Record<string, unknown>) => {
  const response = await call("http://api.public.test/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": MCP_VERSION,
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++mcpId,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": MCP_VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
        }
      }
    })
  })
  const text = await response.text()
  const message: Json = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  return { isError: message.result.isError as boolean, body: JSON.parse(message.result.content[0].text) as Json }
}

const encoder = new TextEncoder()

/** The supplier's own API signing its event (`t=…,v1=…`, HMAC-SHA256 over `t.body`). */
const sign = async (secret: string, body: string) => {
  const t = Math.floor(Date.now() / 1000)
  const mac = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    encoder.encode(`${t}.${body}`)
  )
  return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`
}

const delays = async (workspace: string) => (await outboxOf(workspace)).filter((e) => e.event === "order.delayed")

describe("order delays", () => {
  it("marks and clears a delay by hand, each with undo, and tells the automations only", async () => {
    const store = await importedStore("dly-hand")
    const open = await orderNumbered(store.cookie, "#1001")
    const cancelled = await orderNumbered(store.cookie, "#1005")
    expect(open.delayedAt).toBeNull()

    expect(failure(await rpc("Orders.flagDelayed", { ids: [open.id, cancelled.id] }, store.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "closed"
    })
    expect(failure(await rpc("Orders.flagDelayed", { ids: ["ord_none"] }, store.cookie))).toMatchObject({
      _tag: "NotFound"
    })

    // Marked at once; the event waits out the window, and Undo calls it off.
    const flagged = ok(await rpc("Orders.flagDelayed", { ids: [open.id] }, store.cookie))
    expect(flagged.orders[0]?.delayedAt).not.toBeNull()
    expect(flagged.undo?.token).toMatch(/^und_/)
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).not.toBeNull()
    // Already delayed is no change.
    expect(ok(await rpc("Orders.flagDelayed", { ids: [open.id] }, store.cookie))).toMatchObject({
      orders: [],
      undo: null
    })
    ok(await rpc("Shared.undo", { token: flagged.undo!.token }, store.cookie))
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).toBeNull()
    expect((await delays(store.workspace)).map((e) => e.cancelled)).toEqual([true])

    // Marked for good: automations hear `manual` once the window has passed; no one is notified, no mail goes.
    ok(await rpc("Orders.flagDelayed", { ids: [open.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await delays(store.workspace)).filter((e) => !e.cancelled).map((e) => e.payload)).toMatchObject([
      { orderIds: [open.id], reason: "manual" }
    ])
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    expect(notes.filter((n) => n.kind === "order.late")).toEqual([])
    expect((await outboxOf(store.workspace)).filter((e) => e.event === "order.delay_mail")).toEqual([])

    // Cleared, with an undo that puts it back as it was.
    const before = (await orderNumbered(store.cookie, "#1001")).delayedAt
    const cleared = ok(await rpc("Orders.clearDelay", { ids: [open.id] }, store.cookie))
    expect(cleared.orders[0]?.delayedAt).toBeNull()
    ok(await rpc("Shared.undo", { token: cleared.undo!.token }, store.cookie))
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).toBe(before)
    ok(await rpc("Orders.clearDelay", { ids: [open.id] }, store.cookie))
    expect(ok(await rpc("Orders.clearDelay", { ids: [open.id] }, store.cookie))).toMatchObject({
      orders: [],
      undo: null
    })

    // Marked and cleared within the window: the waiting event is called off, so no one hears of it.
    ok(await rpc("Orders.flagDelayed", { ids: [open.id] }, store.cookie))
    ok(await rpc("Orders.clearDelay", { ids: [open.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect((await delays(store.workspace)).map((e) => e.cancelled)).toEqual([true, false, true])

    // The same over `/v1`; a key held to another store does not find the order.
    const token = await key(store.cookie, "Vertraging", "all", false)
    const v1 = (secret: string, method: "POST" | "DELETE") =>
      call(`http://api.public.test/v1/orders/${open.id}/delay`, {
        method,
        headers: { authorization: `Bearer ${secret}`, "idempotency-key": `${method}-${secret.slice(-8)}-${run}` }
      })
    expect((await v1(token, "POST")).status).toBe(200)
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).not.toBeNull()
    expect((await v1(token, "DELETE")).status).toBe(200)
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).toBeNull()
    const elsewhere = await key(store.cookie, "Andere winkel", ["store_elsewhere"], false)
    expect((await v1(elsewhere, "POST")).status).toBe(404)
    expect((await v1(elsewhere, "DELETE")).status).toBe(404)
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).toBeNull()

    // Over MCP with the same key; an agent's key is refused (no agent action names a delay yet).
    const marked = await tool(token, "flag_order_delayed", { order_id: open.id, idempotency_key: `mcp-flag-${run}` })
    expect(marked.isError).toBe(false)
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).not.toBeNull()
    expect((await tool(token, "clear_order_delay", { order_id: open.id, idempotency_key: `mcp-clear-${run}` })).isError)
      .toBe(false)
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).toBeNull()
    const agent = await key(store.cookie, "Agent", "all", true)
    for (const name of ["flag_order_delayed", "clear_order_delay"]) {
      const refused = await tool(agent, name, { order_id: open.id, idempotency_key: `agent-${name}-${run}` })
      expect(refused.isError).toBe(true)
      expect(refused.body).toMatchObject({ error: { code: "ActionNotAllowedV1", action: name, reason: "unknown" } })
    }
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).toBeNull()
  })

  it("names an order's supplier, delays it when the supplier is late, and tells only who reaches its store", async () => {
    const store = await importedStore("dly-sup")
    const atelier = ok(await rpc("Suppliers.list", {}, store.cookie)).rows.find((r) => r.name === "Atelier Noord")!
    const address = `atelier-${run}@supplier.example`
    ok(await rpc("Suppliers.update", { id: atelier.id, contactEmail: address, forwardEmail: address }, store.cookie))

    // A member like Klantenservice, held to another store.
    const made = ok(await rpc("Roles.create", { label: "Andere winkel", from: "service" }, store.cookie))
    const role = made.roles.roles.find((r) => r.id === made.id)!
    ok(
      await rpc("Roles.update", {
        id: role.id,
        levels: role.levels,
        specials: role.specials,
        refundLimit: role.refundLimit,
        stores: ["store_elsewhere"]
      }, store.cookie)
    )
    const email = `dly-${run}-fenced@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: role.id, stores: "all" }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const fenced = await join(email)

    // #1001 goes to Atelier Noord by mail; placed in October, its hand-off has long passed.
    const leg = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!
    await using sends = await introspectWorkflow(env.FORWARD_SEND)
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [send] = await sends.get()
    await send!.waitForStatus("complete")

    const row = await orderNumbered(store.cookie, "#1001")
    expect(row.suppliers).toEqual([{ id: atelier.id, name: "Atelier Noord" }])
    const detail = ok(await rpc("Orders.get", { id: row.id }, store.cookie))
    expect(detail.supplierWork).toMatchObject([{
      id: atelier.id,
      name: "Atelier Noord",
      work: "to_accept",
      late: true
    }])
    expect(detail.supplierWork[0]?.forwardedAt).not.toBeNull()
    const handoffBy = detail.supplierWork[0]!.handoffBy!

    // The fenced member does not see the order, cannot mark it, and does not hear of it.
    expect(failure(await rpc("Orders.get", { id: row.id }, fenced))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Orders.flagDelayed", { ids: [row.id] }, fenced))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Orders.clearDelay", { ids: [row.id] }, fenced))).toMatchObject({ _tag: "NotFound" })

    // A hand-off more than seven days back is the backlog: the check leaves it be.
    expect(await supplierLate(store.workspace, handoffBy + 8 * 24 * HOUR)).toEqual([])
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).toBeNull()

    // The hourly check two hours past the hand-off: late once, naming the supplier and the hours.
    expect(await supplierLate(store.workspace, handoffBy + 2 * HOUR)).toHaveLength(1)
    expect(await supplierLate(store.workspace, handoffBy + 3 * HOUR)).toEqual([])
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).not.toBeNull()
    expect((await delays(store.workspace)).map((e) => e.payload)).toMatchObject([
      { orderIds: [row.id], reason: "supplier_late", supplier: "Atelier Noord", hours: 2 }
    ])
    await relay(store.workspace)
    const owners = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    expect(owners.find((n) => n.kind === "order.late")?.data).toMatchObject({
      number: "#1001",
      reason: "supplier_late",
      supplier: "Atelier Noord"
    })
    const theirs = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, fenced)).items
    expect(theirs.filter((n) => n.kind === "order.late")).toEqual([])

    // Cleared after the hand-off passed: the check leaves it be.
    ok(await rpc("Orders.clearDelay", { ids: [row.id] }, store.cookie))
    expect(await supplierLate(store.workspace, handoffBy + 4 * HOUR)).toEqual([])
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).toBeNull()
  })

  it("checks a supplier's later date afresh after a clear, and marks it once when two checks run at once", async () => {
    const store = await importedStore("dly-date")
    const atelier = ok(await rpc("Suppliers.list", {}, store.cookie)).rows.find((r) => r.name === "Atelier Noord")!
    const { secret } = ok(
      await rpc("Suppliers.connectApi", { id: atelier.id, url: "https://echo.supplier.example/orders" }, store.cookie)
    )
    ok(await rpc("Suppliers.update", { id: atelier.id, forwardChannel: "api" }, store.cookie))

    // #1001 goes to Atelier Noord by its API.
    const leg = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!
    await using sends = await introspectWorkflow(env.FORWARD_SEND)
    ok(await rpc("Forwarding.forward", { ids: [leg.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [send] = await sends.get()
    await send!.waitForStatus("complete")
    const handoff = async () =>
      ok(await rpc("Orders.get", { id: leg.orderId }, store.cookie)).supplierWork[0]!.handoffBy!

    // Late at the first hand-off, and cleared by the operator.
    const first = await handoff()
    expect(await supplierLate(store.workspace, first + HOUR)).toHaveLength(1)
    ok(await rpc("Orders.clearDelay", { ids: [leg.orderId] }, store.cookie))
    expect(await supplierLate(store.workspace, first + 2 * HOUR)).toEqual([])

    // The supplier names a later date (three days from now): a new hand-off, checked afresh once it has passed.
    const date = new Date(Date.now() + 3 * 24 * HOUR).toISOString().slice(0, 10)
    const body = JSON.stringify({ type: "order.problem", leg_id: leg.id, kind: "delay", note: "Later", new_date: date })
    const hooked = await call(`http://api.public.test/hooks/supplier/${atelier.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", "insyte-signature": await sign(Redacted.value(secret), body) },
      body
    })
    expect(hooked.status).toBe(200)
    const later = await handoff()
    expect(later).toBeGreaterThan(Date.now())
    expect(await supplierLate(store.workspace, later - HOUR)).toEqual([])

    // Two checks at the same moment mark it once, with one event.
    const both = await Promise.all([
      supplierLate(store.workspace, later + HOUR),
      supplierLate(store.workspace, later + HOUR)
    ])
    expect(both.flat()).toHaveLength(1)
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).not.toBeNull()
    expect((await delays(store.workspace)).map((e) => e.payload)).toMatchObject([
      { orderIds: [leg.orderId], reason: "supplier_late", hours: 1 },
      { orderIds: [leg.orderId], reason: "supplier_late", hours: 1 }
    ])
  })
})
