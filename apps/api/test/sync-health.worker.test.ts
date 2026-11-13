import { describe, expect, it } from "vitest"
import { ok, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Sync health (M17 step 6, PLAN 49), against the recorded twin: the 15-minute check opens one incident per finding on
 * a store's connection and resolves it when the check is healthy again. A webhook gap rewinds the sweep to where the
 * webhooks stopped; whoever connected the store hears of each incident once, with what Insyte already tried; Start
 * shows it until it resolves; the shell's line and `Connections.health` say it; a key with `data.read` reads it over
 * `/v1` and MCP. The check runs here through `__dev/stores/health`, which stages the store and runs one workspace's
 * turn, without the rest of the cron.
 */

// A loose read of an answer.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

interface Checked {
  cursors: Array<{ resource: string; watermarkAt: number | null }>
  incidents: Array<{ kind: string; open: boolean; notified: boolean; facts: Json; tried: Json }>
}

const HOUR = 3_600_000

const check = async (
  store: { workspace: string; storeId: string },
  body: { stage?: Record<string, unknown>; sweep?: Record<string, unknown> } = {}
) =>
  (await (await call(`http://api.test/api/__dev/stores/health?workspace=${store.workspace}&store=${store.storeId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })).json()) as Checked

const openKinds = (checked: Checked) => checked.incidents.filter((i) => i.open).map((i) => i.kind).toSorted()

const v1 = async (path: string, token: string) => {
  const response = await call(`http://api.public.test/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: response.status, body: await response.json() as Json }
}

const mcp = async (token: string, name: string) => {
  const response = await call("http://api.public.test/mcp", {
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
        arguments: {},
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
  return JSON.parse(message.result.content[0].text) as Json
}

describe("sync health", () => {
  it("opens nothing on a healthy store, and the shell's line says the sync is in order", async () => {
    const store = await importedStore("health-ok")
    const checked = await check(store, { sweep: { ok: true, headroom: 0.9, throttled: false, reason: null } })
    expect(openKinds(checked)).toEqual([])
    const frame = ok(await rpc("Shell.frame", { path: "/dashboard" }, store.cookie))
    expect(frame.health).toMatchObject({ state: "ok", stores: 1, attention: [] })
    expect(frame.health.lastSyncedAt).not.toBeNull()
    const health = ok(await rpc("Connections.health", undefined, store.cookie))
    expect(health.connections).toEqual([
      expect.objectContaining({ storeId: store.storeId, state: "ok", provider: "shopify", incidents: [] })
    ])
  })

  it("notices webhooks that stopped, reads the gap again, tells who connected the store and shows it on Start", async () => {
    const store = await importedStore("health-gap")
    // Orders still change in Shopify (the sweep read one an hour ago), but the last order webhook came five hours ago.
    const checked = await check(store, { stage: { importedHoursAgo: 24, deliveryHoursAgo: 5, watermarkHoursAgo: 1 } })
    expect(openKinds(checked)).toEqual(["webhook_gap"])
    const gap = checked.incidents.find((i) => i.kind === "webhook_gap")!
    expect(gap.notified).toBe(true)
    expect(gap.tried).toEqual([expect.objectContaining({ step: "reconcile", outcome: "done" })])
    const since = gap.facts.since as number
    expect(Date.now() - since).toBeGreaterThan(4.9 * HOUR)
    // Every resource's sweep starts over from where the webhooks stopped.
    for (const cursor of checked.cursors) expect(cursor.watermarkAt).toBeLessThanOrEqual(since)

    // Checking again keeps the one incident, and tells nobody twice.
    expect(openKinds(await check(store))).toEqual(["webhook_gap"])
    await relay(store.workspace)
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    const heard = notes.filter((n) => n.subjectType === "connection_incident")
    expect(heard).toHaveLength(1)
    expect(heard[0]).toMatchObject({ kind: "integration.sync" })
    expect(heard[0]!.data).toMatchObject({ incident: "webhook_gap", storeId: store.storeId })
    expect(String((heard[0]!.data as Json).finding)).toMatch(/geen webhooks van Shopify/)

    const queued = ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows.filter((r) =>
      r.kind === "connection_incident"
    )
    expect(queued).toEqual([expect.objectContaining({ signal: "amber", subjectId: store.storeId })])
    expect(queued[0]!.title).toMatch(/Insyte haalt de wijzigingen zelf op/)
    const frame = ok(await rpc("Shell.frame", { path: "/dashboard" }, store.cookie))
    expect(frame.health).toMatchObject({
      state: "warning",
      attention: [{ storeId: store.storeId, kind: "webhook_gap" }]
    })

    // A webhook arrives: the gap is over, and Start lets the row go.
    expect(openKinds(await check(store, { stage: { deliveryHoursAgo: 0 } }))).toEqual([])
    await relay(store.workspace)
    const after = ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows.filter((r) =>
      r.kind === "connection_incident"
    )
    expect(after).toEqual([])
    const health = ok(await rpc("Connections.health", undefined, store.cookie))
    expect(health.connections[0]).toMatchObject({ state: "ok" })
    expect(health.connections[0]!.incidents).toEqual([
      expect.objectContaining({ kind: "webhook_gap", resolvedAt: expect.any(Number), notified: expect.any(String) })
    ])
  })

  it("warns a week before the grant lapses, and when the sync's scopes are missing", async () => {
    const store = await importedStore("health-grant")
    let checked = await check(store, { stage: { refreshExpiresInDays: 3, scopes: ["read_orders", "write_products"] } })
    expect(openKinds(checked)).toEqual(["scope_missing", "token_expiring"])
    expect(checked.incidents.find((i) => i.kind === "scope_missing")!.facts).toEqual({ missing: ["read_customers"] })
    const health = ok(await rpc("Connections.health", undefined, store.cookie))
    expect(health.connections[0]).toMatchObject({ state: "broken" })
    expect(ok(await rpc("Shell.health", undefined, store.cookie))).toMatchObject({ state: "broken" })

    // The store approved again: a fresh grant with every scope.
    checked = await check(store, {
      stage: { refreshExpiresInDays: 90, scopes: ["read_orders", "read_products", "read_customers"] }
    })
    expect(openKinds(checked)).toEqual([])

    // Shopify refused a new token: the grant is gone, and what Insyte tried says so.
    checked = await check(store, { stage: { connectionStatus: "token_expired" } })
    expect(openKinds(checked)).toEqual(["token_expired"])
    expect(checked.incidents.find((i) => i.open)!.tried).toEqual([
      expect.objectContaining({ step: "refresh", outcome: "refused" })
    ])
  })

  it("opens sync_failed on the second failed sweep in a row and the rate limit when the bucket runs low", async () => {
    const store = await importedStore("health-sweep")
    const failed = { ok: false, headroom: null, throttled: false, reason: "ShopifyRefused" }
    expect(openKinds(await check(store, { sweep: failed }))).toEqual([])
    let checked = await check(store, { sweep: failed })
    expect(openKinds(checked)).toEqual(["sync_failed"])
    checked = await check(store, { sweep: failed })
    expect(checked.incidents.find((i) => i.kind === "sync_failed")!.tried).toHaveLength(2)

    checked = await check(store, { sweep: { ok: true, headroom: 0.04, throttled: false, reason: null } })
    expect(openKinds(checked)).toEqual(["rate_limited"])
    expect(checked.incidents.find((i) => i.kind === "rate_limited")!.facts).toEqual({ headroom: 0.04 })
    checked = await check(store, { sweep: { ok: true, headroom: 0.8, throttled: false, reason: null } })
    expect(openKinds(checked)).toEqual([])
  })

  it("answers /v1/connections/health and get_connection_health for a key with data.read, and refuses one without", async () => {
    const store = await importedStore("health-api")
    await check(store, { stage: { importedHoursAgo: 24, deliveryHoursAgo: 5, watermarkHoursAgo: 1 } })
    const make = async (label: string, scopes: Record<string, number>) =>
      ok(
        await rpc("ApiKeys.create", {
          label,
          access: { kind: "custom", scopes } as never,
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent: false
        }, store.cookie)
      ).secret
    const reader = await make("Sync", { data: 1 })
    const orders = await make("Alleen bestellingen", { orders: 1 })
    const health = await v1("/connections/health", reader)
    expect(health.status).toBe(200)
    expect(health.body.data).toEqual([
      expect.objectContaining({ store_id: store.storeId, state: "warning", provider: "shopify" })
    ])
    expect(health.body.data[0].incidents[0]).toMatchObject({
      kind: "webhook_gap",
      resolved_at: null,
      summary: expect.stringMatching(/geen webhooks/),
      tried: [expect.objectContaining({ step: "reconcile", text: expect.stringMatching(/zelf op bij Shopify/) })]
    })
    const refused = await v1("/connections/health", orders)
    expect(refused.status).toBe(403)
    expect(refused.body.error).toMatchObject({ code: "ScopeMissingV1", scope: "data.read" })
    const tool = await mcp(reader, "get_connection_health")
    expect(tool.data[0]).toMatchObject({ store_id: store.storeId, state: "warning" })
  })
})
