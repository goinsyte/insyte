import { describe, expect, it } from "vitest"
import { join, mailsTo, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Sync health (M17 step 6, PLAN 49), against the recorded twin: the 15-minute check opens one incident per finding on
 * a store's connection and resolves it when the check is healthy again. It reads what the sweeps wrote on the
 * connection, never a sweep of its own run. Whoever connected the store hears of each incident once (and of the same
 * kind again only after six hours), with what Insyte already tried; Start shows it until it resolves; the shell's line
 * and `Connections.health` say it; a key with `data.read` reads it over `/v1` and MCP. The check runs here through
 * `__dev/stores/health`, which stages the store, can sweep it, and runs one workspace's turn, without the rest of the
 * cron.
 */

// A loose read of an answer.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

interface Checked {
  due: boolean
  health: Record<string, Json> | null
  lastSweptAt: number | null
  cursors: Array<{ resource: string; watermarkAt: number | null }>
  incidents: Array<{ kind: string; open: boolean; notified: boolean; facts: Json; tried: Json }>
}

const HOUR = 3_600_000

const check = async (
  store: { workspace: string; storeId: string },
  body: { stage?: Record<string, unknown>; sweep?: boolean; check?: boolean } = {}
) =>
  (await (await call(`http://api.test/api/__dev/stores/health?workspace=${store.workspace}&store=${store.storeId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })).json()) as Checked

/** A store whose import was a day ago, swept a few minutes ago, with order webhooks coming in. */
const steady = { importedHoursAgo: 24, connectedHoursAgo: 24, sweptHoursAgo: 0.1, deliveryHoursAgo: 0.2 }

let delivery = 0
/** An order webhook as Shopify sends it, to the API's public host; answers once the consumer applied it. */
const orderHook = async (store: { workspace: string; storeId: string; shop: string }) => {
  const response = await call("http://api.public.test/hooks/shopify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": "orders/updated",
      "x-shopify-shop-domain": store.shop,
      "x-shopify-webhook-id": `wh-health-${run}-${++delivery}`,
      "x-shopify-hmac-sha256": "valid"
    },
    body: JSON.stringify({ id: 1 })
  })
  expect(response.status).toBe(200)
  for (let i = 0; i < 100; i++) {
    const mirror = await (await call(
      `http://api.test/api/__dev/stores/mirror?workspace=${store.workspace}&store=${store.storeId}`
    )).json() as { inbound: Array<{ processed: boolean }> }
    if (mirror.inbound.every((e) => e.processed)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("the delivery was not applied")
}

const notesAbout = async (store: { workspace: string; cookie: string }, incident: string) => {
  await relay(store.workspace)
  return ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items.filter((n) =>
    n.subjectType === "connection_incident" && (n.data as Json).incident === incident
  )
}

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
    const checked = await check(store)
    expect(checked.due).toBe(false)
    expect(openKinds(checked)).toEqual([])
    const frame = ok(await rpc("Shell.frame", undefined, store.cookie))
    expect(frame.health).toMatchObject({ state: "ok", stores: 1, attention: [] })
    expect(frame.health.lastSyncedAt).not.toBeNull()
    const health = ok(await rpc("Connections.health", undefined, store.cookie))
    expect(health.connections).toEqual([
      expect.objectContaining({ storeId: store.storeId, state: "ok", provider: "shopify", incidents: [] })
    ])
  })

  it("keeps what a sweep that went through saw on the connection, and clears the failures before it", async () => {
    const store = await importedStore("health-swept")
    const checked = await check(store, { stage: { failures: 1, failure: "ShopifyRefused" }, sweep: true })
    expect(checked.lastSweptAt).toBeGreaterThan(Date.now() - 60_000)
    expect(checked.health).toMatchObject({ calmSweeps: 1, lowSweeps: 0, ordersWatermarkAt: expect.any(String) })
    expect(checked.health).not.toHaveProperty("failures")
    expect(checked.health).not.toHaveProperty("failure")
    expect(openKinds(checked)).toEqual([])
  })

  it("notices webhooks that stopped, tells who connected the store and shows it on Start", async () => {
    const store = await importedStore("health-gap")
    // Orders still change in Shopify (the sweep read one an hour ago), but the last order webhook came five hours ago.
    const checked = await check(store, { stage: { ...steady, deliveryHoursAgo: 5, watermarkHoursAgo: 1 } })
    expect(checked.due).toBe(true)
    expect(openKinds(checked)).toEqual(["webhook_gap"])
    const gap = checked.incidents.find((i) => i.kind === "webhook_gap")!
    expect(gap.notified).toBe(true)
    expect(gap.tried).toEqual([expect.objectContaining({ step: "reconcile", outcome: "done" })])
    expect(Date.now() - (gap.facts.since as number)).toBeGreaterThan(4.9 * HOUR)

    // Checking again keeps the one incident, and tells nobody twice.
    expect(openKinds(await check(store))).toEqual(["webhook_gap"])
    const heard = await notesAbout(store, "webhook_gap")
    expect(heard).toHaveLength(1)
    // Insyte is handling it: in the app, not by mail.
    expect(heard[0]).toMatchObject({ kind: "integration.sync" })
    expect(heard[0]!.data).toMatchObject({ storeId: store.storeId })
    expect(String((heard[0]!.data as Json).finding)).toMatch(/geen webhooks van Shopify/)
    expect(String((heard[0]!.data as Json).tried)).toMatch(/Leest de bestellingen sinds .* elk kwartier zelf/)

    const queued = ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows.filter((r) =>
      r.kind === "connection_incident"
    )
    expect(queued).toEqual([expect.objectContaining({ signal: "amber", subjectId: store.storeId })])
    expect(queued[0]!.title).toMatch(/Insyte leest de bestellingen zelf bij Shopify/)
    const frame = ok(await rpc("Shell.frame", undefined, store.cookie))
    expect(frame.health).toMatchObject({
      state: "warning",
      attention: [{ storeId: store.storeId, kind: "webhook_gap" }]
    })

    // An order webhook arrives: the gap is over, and Start lets the row go.
    await orderHook(store)
    expect(openKinds(await check(store))).toEqual([])
    await relay(store.workspace)
    const after = ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows.filter((r) =>
      r.kind === "connection_incident"
    )
    expect(after).toEqual([])
    const health = ok(await rpc("Connections.health", undefined, store.cookie))
    expect(health.connections[0]).toMatchObject({ state: "ok", lastDeliveryAt: expect.any(Number) })
    expect(health.connections[0]!.incidents).toEqual([
      expect.objectContaining({ kind: "webhook_gap", resolvedAt: expect.any(Number), notified: expect.any(String) })
    ])
  })

  it("tells who connected the store only while they still reach it, else the owner", async () => {
    const store = await importedStore("health-reach")
    // A colleague whose role reaches another store only: they connected this one, then lost it.
    const created = ok(await rpc("Roles.create", { label: "Elders", from: null }, store.cookie))
    const role = created.roles.roles.find((r) => r.id === created.id)!
    ok(
      await rpc("Roles.update", {
        id: created.id,
        levels: role.levels,
        specials: role.specials,
        refundLimit: null,
        stores: ["sto_elders"]
      }, store.cookie)
    )
    const email = `health-${run}-elders@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: created.id, stores: "all" }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const cookie = await join(email)
    const colleague = ok(await sessionMe(cookie)).principals[0]!.id

    const checked = await check(store, {
      stage: { ...steady, deliveryHoursAgo: 5, watermarkHoursAgo: 1, connectedBy: colleague }
    })
    expect(openKinds(checked)).toEqual(["webhook_gap"])
    // The owner hears of it; the colleague, who no longer reaches the store, does not.
    expect(await notesAbout(store, "webhook_gap")).toHaveLength(1)
    expect(await notesAbout({ workspace: store.workspace, cookie }, "webhook_gap")).toEqual([])
  })

  it("counts no gap over the weeks a store was gone: connected again, the reconnect is where it starts", async () => {
    const store = await importedStore("health-back")
    const checked = await check(store, {
      stage: {
        deliveryHoursAgo: 20 * 24,
        connectedHoursAgo: 1,
        importedHoursAgo: 0.8,
        sweptHoursAgo: 0.1,
        watermarkHoursAgo: 0
      }
    })
    expect(checked.due).toBe(false)
    expect(openKinds(checked)).toEqual([])
  })

  it("warns a week before the grant lapses and when the sync's scopes are missing, by mail too", async () => {
    const store = await importedStore("health-grant")
    let checked = await check(store, { stage: { refreshExpiresInDays: 3, scopes: ["read_orders", "write_products"] } })
    expect(checked.due).toBe(true)
    expect(openKinds(checked)).toEqual(["scope_missing", "token_expiring"])
    expect(checked.incidents.find((i) => i.kind === "scope_missing")!.facts).toEqual({ missing: ["read_customers"] })
    const health = ok(await rpc("Connections.health", undefined, store.cookie))
    expect(health.connections[0]).toMatchObject({ state: "broken" })
    expect(ok(await rpc("Shell.health", undefined, store.cookie))).toMatchObject({ state: "broken" })
    // Only the operator can mend these: Primair, and a mail.
    expect(await notesAbout(store, "token_expiring")).toEqual([
      expect.objectContaining({ kind: "integration.disconnected" })
    ])
    expect((await mailsTo(store.email)).filter((m) => m.kind === "member.notification").length).toBeGreaterThan(0)

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

  it("opens sync_failed on the second failed sweep in a row, by mail, and tells nobody again within six hours", async () => {
    const store = await importedStore("health-failed")
    const failed = (failures: number) => ({ ...steady, failures, failure: "ShopifyRefused" })
    expect(openKinds(await check(store, { stage: failed(1) }))).toEqual([])
    let checked = await check(store, { stage: failed(2) })
    expect(checked.due).toBe(true)
    expect(openKinds(checked)).toEqual(["sync_failed"])
    checked = await check(store, { stage: failed(3) })
    const open = checked.incidents.find((i) => i.kind === "sync_failed")!
    expect(open.tried).toHaveLength(2)
    expect(open.facts).toMatchObject({ failures: 3 })
    expect(await notesAbout(store, "sync_failed")).toEqual([
      expect.objectContaining({ kind: "integration.disconnected" })
    ])

    // A sweep goes through: it ends. Two more fail: it opens again, and the one on call already heard of it.
    expect(openKinds(await check(store, { stage: { failures: 0, sweptHoursAgo: 0 } }))).toEqual([])
    checked = await check(store, { stage: failed(2) })
    expect(checked.incidents.filter((i) => i.kind === "sync_failed").map((i) => [i.open, i.notified])).toEqual([
      [false, true],
      [true, true]
    ])
    expect(await notesAbout(store, "sync_failed")).toHaveLength(1)
  })

  it("counts a sweep that finds no token as one that failed, and opens sync_failed on the second", async () => {
    const store = await importedStore("health-token")
    let checked = await check(store, { stage: { credentials: false }, sweep: true })
    expect(checked.health).toMatchObject({ failures: 1, failure: "credentials" })
    expect(openKinds(checked)).toEqual([])
    checked = await check(store, { sweep: true })
    expect(checked.health).toMatchObject({ failures: 2 })
    expect(checked.due).toBe(true)
    expect(openKinds(checked)).toEqual(["sync_failed"])
    expect(checked.incidents[0]!.tried).toEqual([
      expect.objectContaining({ step: "reconcile", outcome: "failed", reason: "credentials" })
    ])
  })

  it("opens sync_failed on a store no sweep read through for an hour", async () => {
    const store = await importedStore("health-stale")
    const checked = await check(store, { stage: { ...steady, sweptHoursAgo: 2 } })
    expect(checked.due).toBe(true)
    expect(openKinds(checked)).toEqual(["sync_failed"])
    expect(Date.now() - (checked.incidents[0]!.facts.since as number)).toBeGreaterThan(1.9 * HOUR)
    // A throttled sweep did reach it.
    expect(openKinds(await check(store, { stage: { throttledHoursAgo: 0 } }))).toEqual([])
  })

  it("opens the rate limit on two low sweeps in a row, and lets it go after two calm ones", async () => {
    const store = await importedStore("health-rate")
    expect(openKinds(await check(store, { stage: { ...steady, lowSweeps: 1, calmSweeps: 0, headroom: 0.04 } })))
      .toEqual([])
    let checked = await check(store, { stage: { lowSweeps: 2 } })
    expect(openKinds(checked)).toEqual(["rate_limited"])
    expect(checked.incidents.find((i) => i.kind === "rate_limited")!.facts).toEqual({ headroom: 0.04 })
    checked = await check(store, { stage: { lowSweeps: 0, calmSweeps: 1, headroom: 0.8 } })
    expect(openKinds(checked)).toEqual(["rate_limited"])
    checked = await check(store, { stage: { calmSweeps: 2 } })
    expect(openKinds(checked)).toEqual([])
  })

  it("ends what is open on a store let go, and tells the console so", async () => {
    const store = await importedStore("health-gone")
    expect(openKinds(await check(store, { stage: { ...steady, sweptHoursAgo: 2 } }))).toEqual(["sync_failed"])
    ok(await rpc("Stores.disconnect", { id: store.storeId }, store.cookie))
    const checked = await check(store, { check: false })
    expect(openKinds(checked)).toEqual([])
    expect(checked.due).toBe(false)
    const changed = (await outboxOf(store.workspace)).filter((e) =>
      e.event === "records.changed" && e.payload["kind"] === "connection"
    )
    expect(changed.length).toBeGreaterThanOrEqual(2)
  })

  it("answers /v1/connections/health and get_connection_health for a key with data.read, and refuses one without", async () => {
    const store = await importedStore("health-api")
    await check(store, { stage: { ...steady, deliveryHoursAgo: 5, watermarkHoursAgo: 1 } })
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
      tried: [expect.objectContaining({ step: "reconcile", text: expect.stringMatching(/zelf bij Shopify/) })]
    })
    const refused = await v1("/connections/health", orders)
    expect(refused.status).toBe(403)
    expect(refused.body.error).toMatchObject({ code: "ScopeMissingV1", scope: "data.read" })
    const tool = await mcp(reader, "get_connection_health")
    expect(tool.data[0]).toMatchObject({ store_id: store.storeId, state: "warning" })
  })
})
