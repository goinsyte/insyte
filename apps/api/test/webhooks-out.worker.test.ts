import {
  createExecutionContext,
  createScheduledController,
  introspectWorkflow,
  introspectWorkflowInstance,
  waitOnExecutionContext
} from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import worker from "../src/Main.ts"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc } from "./support.ts"

/*
 * Instellingen → Webhooks on the server (step 19a, M19.4): an endpoint is made with its signing secret, refused where
 * it would send inside a network or over plain HTTP, and hears the events it takes, signed, through a Workflow of its
 * own per delivery (the recorded sender answers by the URL's first label). Five failed attempts in a row switch it off
 * and tell the owner; a test send and a redelivery are deliveries of one attempt; a change, a rotation and a removal
 * are taken back with undo; another workspace sees none of it. A delivery whose run went quiet is re-armed by the
 * minute cron, and the old run sends nothing; a bulk fact's deliveries are made in one go and run after commit; a member
 * subscribes to and reads the deliveries of their own stores only, and the body only where their role reads its records.
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
  for (const instance of all) await instance.waitForStatus("complete")
}

/** A colleague's invitation address, unique to this run. */
const email = (who: string) => `whk-${who}-${run}@invited.test`

/** The minute cron, as if it ran at `at` (never a quarter past: only the minute's work). */
const cron = async (at: number) => {
  const minute = new Date(at).getUTCMinutes() % 15 === 0 ? at + 60_000 : at
  const ctx = createExecutionContext()
  await worker.scheduled(createScheduledController({ scheduledTime: minute }), env, ctx)
  await waitOnExecutionContext(ctx)
}

/** Waits until the endpoint's deliveries are as `done` says. */
const until = async (
  cookie: string,
  endpointId: string,
  done: (rows: ReadonlyArray<{ outcome: string; attempts: number }>) => boolean
) => {
  for (let i = 0; i < 200; i++) {
    const rows = ok(await rpc("Webhooks.deliveries", { endpointId }, cookie))
    if (done(rows)) return rows
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("the deliveries did not get there")
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

  it("re-arms a delivery whose run went quiet, and a stale run sends nothing", async () => {
    const store = await importedStore("whk-rearm")
    // The first run keeps its sleeps: after its first failure it waits a real minute, as if it had died.
    const made = ok(
      await rpc("Webhooks.create", input("https://fail.webhooks.example/r", ["order.cancelled"]), store.cookie)
    )
    const order = await orderNumbered(store.cookie, "#1001")
    ok(await rpc("Orders.cancel", { ids: [order.id], restock: false, notify: false }, store.cookie))
    await relay(store.workspace)
    const [first] = await until(store.cookie, made.endpoint.id, (rows) => rows[0]?.attempts === 1)
    expect(first).toMatchObject({ outcome: "retrying", attempts: 1, maxAttempts: 3 })
    const id = (first as { id: string }).id

    // Fifteen minutes on, ten past the attempt it waits for: the cron gives it a run of the next number.
    await using rearmed = await introspectWorkflowInstance(env.WEBHOOK_DELIVERY, `${id}-1`)
    await rearmed.modify(async (m) => {
      await m.disableSleeps()
    })
    await cron(Date.now() + 15 * 60_000)
    await rearmed.waitForStatus("complete")
    const [after] = ok(await rpc("Webhooks.deliveries", { endpointId: made.endpoint.id }, store.cookie))
    expect(after).toMatchObject({ id, outcome: "failed", attempts: 3 })

    // The old run, should it wake, is no longer the delivery's: it records nothing and sends nothing.
    await using stale = await introspectWorkflowInstance(env.WEBHOOK_DELIVERY, `${id}-stale`)
    await env.WEBHOOK_DELIVERY.create({
      id: `${id}-stale`,
      params: { workspaceId: store.workspace, deliveryId: id, run: 0 }
    })
    expect(await stale.waitForStepResult({ name: "attempt 1" })).toMatchObject({ stale: true, next: null })
    await stale.waitForStatus("complete")
    const [still] = ok(await rpc("Webhooks.deliveries", { endpointId: made.endpoint.id }, store.cookie))
    expect(still).toMatchObject({ outcome: "failed", attempts: 3 })

    // Nothing open is left for the cron, however late it runs.
    await cron(Date.now() + 60 * 60_000)
    expect(ok(await rpc("Webhooks.deliveries", { endpointId: made.endpoint.id }, store.cookie))[0]).toMatchObject({
      attempts: 3
    })
  })

  it("makes a bulk fact's deliveries in one go, and runs them once it has committed", async () => {
    const store = await importedStore("whk-bulk")
    await using runs = await introspectWorkflow(env.WEBHOOK_DELIVERY)
    await runs.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    const a = ok(
      await rpc("Webhooks.create", input("https://ok.webhooks.example/a", ["customer.updated"]), store.cookie)
    )
    const b = ok(
      await rpc("Webhooks.create", input("https://echo.webhooks.example/b", ["customer.updated"]), store.cookie)
    )
    // Three customers tagged at once: one fact, three public events.
    const customers = ok(await rpc("Customers.list", { limit: 50 }, store.cookie)).rows.slice(0, 3)
    expect(customers).toHaveLength(3)
    ok(await rpc("Customers.tag", { ids: customers.map((c) => c.id), add: ["erp"], remove: [] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    await settle(runs, 6)

    for (const endpoint of [a, b]) {
      const rows = ok(await rpc("Webhooks.deliveries", { endpointId: endpoint.endpoint.id }, store.cookie))
      expect(rows).toHaveLength(3)
      // Each one delivered on its first try: its run never looked for a row that was not there yet.
      expect(rows.every((r) => r.outcome === "delivered" && r.attempts === 1)).toBe(true)
    }
    const bodies = await Promise.all(
      ok(await rpc("Webhooks.deliveries", { endpointId: b.endpoint.id }, store.cookie)).map((r) =>
        rpc("Webhooks.delivery", { id: r.id }, store.cookie).then(ok)
      )
    )
    expect(new Set(bodies.map((d) => (d.body as { data: { id: string } }).data.id))).toEqual(
      new Set(customers.map((c) => c.id))
    )
    // One event per customer, the same id at both endpoints.
    const eventsA = ok(await rpc("Webhooks.deliveries", { endpointId: a.endpoint.id }, store.cookie)).map((r) =>
      r.eventId
    )
    expect(new Set(eventsA)).toEqual(new Set(bodies.map((d) => d.delivery.eventId)))
  })

  it("fences a member to their stores and their role's records", async () => {
    const store = await importedStore("whk-fence")
    await using runs = await introspectWorkflow(env.WEBHOOK_DELIVERY)
    await runs.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    // A role that sees the integrations but no orders.
    const role = ok(await rpc("Roles.create", { label: "Koppelingen", from: "view" }, store.cookie))
    const base = role.roles.roles.find((r) => r.id === role.id)!
    ok(
      await rpc("Roles.update", {
        id: role.id,
        levels: { ...base.levels, orders: 0, integrations: 1 },
        specials: base.specials,
        refundLimit: null,
        stores: "all"
      }, store.cookie)
    )
    ok(
      await rpc("Invitations.send", {
        rows: [
          { email: email("own"), roleId: "admin", stores: [store.storeId] },
          { email: email("away"), roleId: "admin", stores: ["sto_elsewhere"] },
          { email: email("blind"), roleId: role.id, stores: "all" }
        ]
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const own = await join(email("own"))
    const away = await join(email("away"))
    const blind = await join(email("blind"))

    // Subscribing: "all" is for a role that reaches every store; a member's own store is theirs to pick.
    const make = (cookie: string, stores: "all" | Array<string>) =>
      rpc("Webhooks.create", input("https://ok.webhooks.example/f", ["order.cancelled"], { stores }), cookie)
    expect(failure(await make(own, "all"))).toMatchObject({ _tag: "Invalid", fields: { stores: "forbidden" } })
    expect(failure(await make(away, [store.storeId]))).toMatchObject({ fields: { stores: "forbidden" } })
    expect(ok(await make(own, [store.storeId])).endpoint.stores).toEqual([store.storeId])
    // A header value that would break the request line is refused.
    expect(
      failure(
        await rpc(
          "Webhooks.create",
          input("https://ok.webhooks.example/h", ["order.cancelled"], {
            headers: [{ key: "X-Token", value: "a\r\nInjected: 1" }]
          }),
          store.cookie
        )
      )
    ).toMatchObject({ fields: { headers: "format" } })

    // The owner's endpoint hears an order of the store, and has a test send.
    const made = ok(
      await rpc("Webhooks.create", input("https://echo.webhooks.example/o", ["order.cancelled"]), store.cookie)
    )
    const order = await orderNumbered(store.cookie, "#1001")
    ok(await rpc("Orders.cancel", { ids: [order.id], restock: false, notify: false }, store.cookie))
    await relay(store.workspace)
    const test = ok(await rpc("Webhooks.sendTest", { id: made.endpoint.id, event: "order.cancelled" }, store.cookie))
    await settle(runs, 2)
    const all = ok(await rpc("Webhooks.deliveries", { endpointId: made.endpoint.id }, store.cookie))
    const real = all.find((d) => !d.test)!
    expect(all).toHaveLength(2)

    // Outside the store: only the test send, and the order's delivery is not there to open or send again.
    expect(ok(await rpc("Webhooks.deliveries", { endpointId: made.endpoint.id }, away)).map((d) => d.id)).toEqual([
      test.deliveryId
    ])
    expect(failure(await rpc("Webhooks.delivery", { id: real.id }, away))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Webhooks.redeliver", { id: real.id }, away))).toMatchObject({ _tag: "NotFound" })
    expect(ok(await rpc("Webhooks.deliveries", { endpointId: made.endpoint.id }, own))).toHaveLength(2)

    // A role without orders sees that it went, not what it carried.
    const hidden = ok(await rpc("Webhooks.delivery", { id: real.id }, blind))
    expect(hidden).toMatchObject({ body: null, response: null, redacted: true, delivery: { outcome: "delivered" } })
    expect(JSON.stringify(hidden)).not.toContain(order.id)
    const shown = ok(await rpc("Webhooks.delivery", { id: real.id }, store.cookie))
    expect(shown).toMatchObject({ redacted: false, body: { data: { id: order.id } } })
  })
})
