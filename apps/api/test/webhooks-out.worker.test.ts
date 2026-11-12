import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, pastUndo, person, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc } from "./support.ts"

/*
 * Instellingen → Webhooks on the server (step 19a, M19.4): an endpoint is made with its signing secret, refused where
 * it would send inside a network or over plain HTTP, and hears the events it takes, signed, through a Workflow of its
 * own per delivery (the recorded sender answers by the URL's first label). Five failed attempts in a row switch it off
 * and tell the owner; a test send and a redelivery are deliveries of one attempt; a change, a rotation and a removal
 * are taken back with undo; another workspace sees none of it.
 */

const input = (url: string, events: Array<string>, extra: Record<string, unknown> = {}) => ({
  url,
  description: "",
  events,
  apiVersion: "2026-10-01",
  stores: "all" as const,
  headers: [],
  retry: 3 as const,
  active: true,
  ...extra
})

const hmac = async (secret: string, payload: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const orderNumbered = async (cookie: string, number: string) => {
  const page = ok(await rpc("Orders.list", { limit: 50 }, cookie))
  return page.rows.find((o) => o.number === number)!
}

/** Every delivery run started meanwhile, run to its end with its sleeps off. */
const settle = async (runs: Awaited<ReturnType<typeof introspectWorkflow>>, count: number) => {
  for (let i = 0; i < 100; i++) {
    if ((await runs.get()).length >= count) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const all = await runs.get()
  expect(all.length).toBeGreaterThanOrEqual(count)
  for (const run of all) await run.waitForStatus("complete")
}

describe("outbound webhooks", () => {
  it("makes an endpoint with its secret shown, and refuses what it may not send to", async () => {
    const owner = await person("whk-owner", "Haken B.V.")
    expect(ok(await rpc("Webhooks.list", undefined, owner.cookie))).toEqual([])
    const made = ok(
      await rpc(
        "Webhooks.create",
        input(" https://ok.webhooks.example/insyte ", ["order.cancelled", "customer.created"], {
          description: " ERP ",
          headers: [{ key: "X-Shop-Token", value: "geheim-123" }]
        }),
        owner.cookie
      )
    )
    expect(made.secret).toMatch(/^whsec_[A-Za-z0-9]{32}$/)
    expect(made.endpoint).toMatchObject({
      url: "https://ok.webhooks.example/insyte",
      description: "ERP",
      events: ["order.cancelled", "customer.created"],
      headers: ["X-Shop-Token"],
      secretPrefix: made.secret.slice(0, 10),
      state: "new",
      health: { count: 0, failed: 0, avgMs: null }
    })
    // Neither the secret nor a header's value comes back with the list.
    const listed = JSON.stringify(ok(await rpc("Webhooks.list", undefined, owner.cookie)))
    expect(listed).not.toContain(made.secret)
    expect(listed).not.toContain("geheim-123")
    expect(ok(await rpc("Webhooks.revealSecret", { id: made.endpoint.id }, owner.cookie)).secret).toBe(made.secret)

    const refused = async (url: string, extra: Record<string, unknown> = {}) =>
      failure(await rpc("Webhooks.create", input(url, ["order.cancelled"], extra), owner.cookie))
    expect(await refused("http://ok.webhooks.example/")).toMatchObject({ _tag: "Invalid", fields: { url: "http" } })
    expect(await refused("https://10.0.0.5/hook")).toMatchObject({ fields: { url: "private" } })
    expect(await refused("https://[::ffff:127.0.0.1]/hook")).toMatchObject({ fields: { url: "private" } })
    expect(await refused("https://intranet.local/hook")).toMatchObject({ fields: { url: "private" } })
    expect(await refused("https://user:pw@ok.webhooks.example/")).toMatchObject({ fields: { url: "credentials" } })
    expect(await refused("https://ok.webhooks.example/", { events: ["order.exploded"] })).toMatchObject({
      fields: { events: "unknown" }
    })
    expect(await refused("https://ok.webhooks.example/", { headers: [{ key: "Insyte-Signature", value: "x" }] }))
      .toMatchObject({ fields: { headers: "forbidden" } })
  })

  it("delivers a cancelled order, signed with the endpoint's secret", async () => {
    const store = await importedStore("whk-deliver")
    await using runs = await introspectWorkflow(env.WEBHOOK_DELIVERY)
    await runs.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    const made = ok(
      await rpc("Webhooks.create", input("https://echo.webhooks.example/orders", ["order.cancelled"]), store.cookie)
    )
    const order = await orderNumbered(store.cookie, "#1001")
    ok(await rpc("Orders.cancel", { ids: [order.id], restock: false, notify: false }, store.cookie))
    await relay(store.workspace)
    await settle(runs, 1)

    const [delivery] = ok(await rpc("Webhooks.deliveries", { endpointId: made.endpoint.id }, store.cookie))
    expect(delivery).toMatchObject({ event: "order.cancelled", outcome: "delivered", status: 200, attempts: 1 })
    const detail = ok(await rpc("Webhooks.delivery", { id: delivery!.id }, store.cookie))
    expect(detail.body).toMatchObject({
      id: delivery!.eventId,
      type: "order.cancelled",
      api_version: "2026-10-01",
      workspace_id: store.workspace,
      store_id: store.storeId,
      data: { id: order.id, number: "#1001", status: "cancelled" }
    })
    // `t=<unix>,v1=<hex>`: HMAC-SHA256 of `<t>.<body as sent>` under the secret (the echo endpoint answers the body).
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(detail.signature!) ?? []
    expect(Number(t)).toBeGreaterThan(Date.now() / 1000 - 300)
    expect(JSON.parse(detail.response!)).toEqual(detail.body)
    expect(v1).toBe(await hmac(made.secret, `${t}.${detail.response}`))

    const endpoint = ok(await rpc("Webhooks.list", undefined, store.cookie))[0]!
    expect(endpoint).toMatchObject({ state: "active", deliveries: 1, health: { count: 1, failed: 0 } })

    // An event the endpoint does not take makes no delivery.
    const other = await orderNumbered(store.cookie, "#1002")
    ok(await rpc("Orders.tag", { ids: [other.id], add: ["erp"], remove: [] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(ok(await rpc("Webhooks.deliveries", { endpointId: made.endpoint.id }, store.cookie))).toHaveLength(1)
  })

  it("retries a failing endpoint, switches it off after five failures in a row, and tells the owner", async () => {
    const store = await importedStore("whk-fail")
    await using runs = await introspectWorkflow(env.WEBHOOK_DELIVERY)
    await runs.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    const made = ok(
      await rpc(
        "Webhooks.create",
        input("https://fail.webhooks.example/hook", ["order.cancelled"], { retry: 5 }),
        store.cookie
      )
    )
    const order = await orderNumbered(store.cookie, "#1001")
    ok(await rpc("Orders.cancel", { ids: [order.id], restock: false, notify: false }, store.cookie))
    await relay(store.workspace)
    await settle(runs, 1)

    const [delivery] = ok(await rpc("Webhooks.deliveries", { endpointId: made.endpoint.id }, store.cookie))
    expect(delivery).toMatchObject({ outcome: "failed", status: 500, attempts: 5, maxAttempts: 5 })
    const endpoint = ok(await rpc("Webhooks.list", undefined, store.cookie))[0]!
    expect(endpoint).toMatchObject({ state: "disabled", failures: 5 })
    expect(endpoint.autoDisabledAt).not.toBeNull()

    await relay(store.workspace)
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    expect(notes.find((n) => n.kind === "integration.disconnected")).toMatchObject({
      subjectType: "webhook_endpoint",
      subjectId: made.endpoint.id,
      data: { url: "https://fail.webhooks.example/hook" }
    })

    // Switched off: no test send, and no new delivery from the next event.
    expect(failure(await rpc("Webhooks.sendTest", { id: made.endpoint.id, event: "order.cancelled" }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "disabled" })
    // Switching it on again clears the run of failures.
    const on = ok(await rpc("Webhooks.setActive", { id: made.endpoint.id, active: true }, store.cookie))
    expect(on.endpoint).toMatchObject({ autoDisabledAt: null, failures: 0, active: true })
  })

  it("sends a test event, redelivers one, and refuses both while paused", async () => {
    const owner = await person("whk-test", "Test Haken B.V.")
    await using runs = await introspectWorkflow(env.WEBHOOK_DELIVERY)
    await runs.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    const made = ok(
      await rpc("Webhooks.create", input("https://ok.webhooks.example/test", ["order.created"]), owner.cookie)
    )
    const id = made.endpoint.id
    const test = ok(await rpc("Webhooks.sendTest", { id, event: "order.created" }, owner.cookie))
    await settle(runs, 1)
    const detail = ok(await rpc("Webhooks.delivery", { id: test.deliveryId }, owner.cookie))
    expect(detail.delivery).toMatchObject({ test: true, outcome: "delivered", status: 200, maxAttempts: 1 })
    expect(detail.body).toMatchObject({ type: "order.created", test: true, data: {} })
    expect(failure(await rpc("Webhooks.sendTest", { id, event: "order.exploded" }, owner.cookie))).toMatchObject({
      _tag: "Invalid",
      fields: { event: "unknown" }
    })

    const again = ok(await rpc("Webhooks.redeliver", { id: test.deliveryId }, owner.cookie))
    await settle(runs, 2)
    const redelivered = ok(await rpc("Webhooks.delivery", { id: again.deliveryId }, owner.cookie))
    expect(redelivered.delivery).toMatchObject({ eventId: detail.delivery.eventId, outcome: "delivered" })
    expect(redelivered.body).toEqual(detail.body)

    // A name that resolves inside a network is refused before anything connects.
    const inside = ok(
      await rpc("Webhooks.create", input("https://inside.webhooks.example/x", ["order.created"]), owner.cookie)
    )
    const refused = ok(await rpc("Webhooks.sendTest", { id: inside.endpoint.id, event: "order.created" }, owner.cookie))
    await settle(runs, 3)
    expect(ok(await rpc("Webhooks.delivery", { id: refused.deliveryId }, owner.cookie)).delivery).toMatchObject({
      outcome: "failed",
      status: null,
      error: "private_address"
    })

    ok(await rpc("Webhooks.setActive", { id, active: false }, owner.cookie))
    expect(failure(await rpc("Webhooks.sendTest", { id, event: "order.created" }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "paused"
    })
    expect(failure(await rpc("Webhooks.redeliver", { id: test.deliveryId }, owner.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "paused"
    })
  })

  it("takes back a change, a rotation and a removal", async () => {
    const owner = await person("whk-undo", "Undo Haken B.V.")
    const made = ok(
      await rpc(
        "Webhooks.create",
        input("https://ok.webhooks.example/a", ["order.cancelled"], { headers: [{ key: "X-Token", value: "een" }] }),
        owner.cookie
      )
    )
    const id = made.endpoint.id

    // A header sent back without its value keeps the one it had.
    const changed = ok(
      await rpc("Webhooks.update", {
        id,
        ...input("https://ok.webhooks.example/b", ["order.cancelled", "order.fulfilled"], {
          headers: [{ key: "X-Token", value: null }]
        })
      }, owner.cookie)
    )
    expect(changed.endpoint).toMatchObject({ url: "https://ok.webhooks.example/b", headers: ["X-Token"] })
    ok(await rpc("Shared.undo", { token: changed.undo.token }, owner.cookie))
    expect(ok(await rpc("Webhooks.list", undefined, owner.cookie))[0]).toMatchObject({
      url: "https://ok.webhooks.example/a",
      events: ["order.cancelled"]
    })

    const rotated = ok(await rpc("Webhooks.rotateSecret", { id }, owner.cookie))
    expect(rotated.secret).not.toBe(made.secret)
    expect(rotated.endpoint.secretRotatedAt).not.toBeNull()
    expect(ok(await rpc("Webhooks.revealSecret", { id }, owner.cookie)).secret).toBe(rotated.secret)
    ok(await rpc("Shared.undo", { token: rotated.undo.token }, owner.cookie))
    expect(ok(await rpc("Webhooks.revealSecret", { id }, owner.cookie)).secret).toBe(made.secret)

    const removed = ok(await rpc("Webhooks.remove", { id }, owner.cookie))
    expect(removed.endpoint).toBeNull()
    expect(ok(await rpc("Webhooks.list", undefined, owner.cookie))).toEqual([])
    expect(failure(await rpc("Webhooks.revealSecret", { id }, owner.cookie))).toMatchObject({ _tag: "NotFound" })
    ok(await rpc("Shared.undo", { token: removed.undo.token }, owner.cookie))
    expect(ok(await rpc("Webhooks.list", undefined, owner.cookie)).map((e) => e.id)).toEqual([id])

    // Another workspace sees none of it.
    const stranger = await person("whk-stranger", "Vreemd B.V.")
    expect(ok(await rpc("Webhooks.list", undefined, stranger.cookie))).toEqual([])
    expect(failure(await rpc("Webhooks.revealSecret", { id }, stranger.cookie))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Webhooks.remove", { id }, stranger.cookie))).toMatchObject({ _tag: "NotFound" })
  })
})
