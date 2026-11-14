import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Delays an operator acts on, and the supplier's clock (M7, M8.3). "Als vertraagd markeren" marks open orders delayed
 * with one undo and, once the window has passed, tells the automations (`order.delayed`, `manual`) but neither the team
 * nor the shopper. "Vertraging wissen" takes it off with an undo. An order knows its suppliers from its legs; the
 * hourly check delays an order whose supplier is past the hand-off, once, and tells whoever handles orders in its store,
 * not a member fenced to another; a delay cleared after the hand-off stays cleared.
 */

const orderNumbered = async (cookie: string, number: string) =>
  ok(await rpc("Orders.list", { limit: 50 }, cookie)).rows.find((o) => o.number === number)!

const supplierLate = async (workspace: string) =>
  (await (await call(`http://api.test/api/__dev/orders/supplier-late?workspace=${workspace}`, { method: "POST" }))
    .json() as { outboxIds: Array<string> }).outboxIds

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

    // The same over `/v1`.
    const key = ok(
      await rpc("ApiKeys.create", {
        label: `Vertraging ${run}`,
        access: { kind: "role", roleId: "service" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    const v1 = (method: "POST" | "DELETE") =>
      call(`http://api.public.test/v1/orders/${open.id}/delay`, {
        method,
        headers: { authorization: `Bearer ${key}`, "idempotency-key": `${method}-${run}` }
      })
    expect((await v1("POST")).status).toBe(200)
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).not.toBeNull()
    expect((await v1("DELETE")).status).toBe(200)
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

    // The fenced member does not see the order, cannot mark it, and does not hear of it.
    expect(failure(await rpc("Orders.get", { id: row.id }, fenced))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Orders.flagDelayed", { ids: [row.id] }, fenced))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Orders.clearDelay", { ids: [row.id] }, fenced))).toMatchObject({ _tag: "NotFound" })

    // The hourly check: late once, naming the supplier.
    expect(await supplierLate(store.workspace)).toHaveLength(1)
    expect(await supplierLate(store.workspace)).toEqual([])
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).not.toBeNull()
    expect((await delays(store.workspace)).map((e) => e.payload)).toMatchObject([
      { orderIds: [row.id], reason: "supplier_late", supplier: "Atelier Noord" }
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
    expect(await supplierLate(store.workspace)).toEqual([])
    expect((await orderNumbered(store.cookie, "#1001")).delayedAt).toBeNull()
  })
})
