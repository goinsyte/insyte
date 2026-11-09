import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, outboxOf, pastUndo, productEventsOf, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc } from "./support.ts"

/*
 * The order commands (step 9.1, M7.1), against Shopify's recorded twin. Each changes the order in Insyte at once;
 * what can be taken back answers an undo token, and Shopify hears it only once the window has passed (the relay
 * leaves the event be until then, and Undo cancels it there). A cancellation has no undo and goes at once. A store
 * whose Shopify refuses a write gets its order read again, so Insyte shows what Shopify holds.
 */

type Outcome = { orderId: string; outcome: string; reason: string | null }

const orderNumbered = async (cookie: string, number: string) => {
  const page = ok(await rpc("Orders.list", { limit: 50 }, cookie))
  return page.rows.find((o) => o.number === number)!
}

describe("the order commands", () => {
  it("tags orders, and tells Shopify only once the undo window has passed", async () => {
    const store = await importedStore("ord-tag")
    const open = await orderNumbered(store.cookie, "#1001")
    const shipped = await orderNumbered(store.cookie, "#1002")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)

    const change = ok(
      await rpc("Orders.tag", { ids: [open.id, shipped.id], add: [" VIP klant "], remove: [] }, store.cookie)
    )
    expect(change.orders.map((o) => [o.number, o.tags])).toEqual([["#1002", ["vip-klant"]], ["#1001", ["vip-klant"]]])
    expect(change.undo?.token).toMatch(/^und_/)
    expect(ok(await rpc("Orders.tags", undefined, store.cookie))).toEqual([{ tag: "vip-klant", count: 2 }])

    // Inside the window the relay leaves the write be: Shopify hears nothing.
    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(0)

    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await writes.get()
    await instance!.waitForStatus("complete")
    expect((await instance!.getOutput() as Array<Outcome>).map((o) => o.outcome)).toEqual(["sent", "sent"])
    expect((await productEventsOf(store.workspace)).filter((e) => e.event === "order_handled")).toHaveLength(1)

    // Sent is sent: too late to undo.
    expect(failure(await rpc("Shared.undo", { token: change.undo!.token }, store.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "already_sent"
    })
  })

  it("undoes a tag inside the window: the tags as they were, and nothing goes to Shopify", async () => {
    const store = await importedStore("ord-undo")
    const open = await orderNumbered(store.cookie, "#1001")
    ok(await rpc("Orders.tag", { ids: [open.id], add: ["terugbellen"], remove: [] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)

    const removed = ok(await rpc("Orders.tag", { ids: [open.id], add: [], remove: ["terugbellen"] }, store.cookie))
    expect(removed.orders[0]?.tags).toEqual([])
    ok(await rpc("Shared.undo", { token: removed.undo!.token }, store.cookie))
    expect(ok(await rpc("Orders.get", { id: open.id }, store.cookie)).order.tags).toEqual(["terugbellen"])
    expect(failure(await rpc("Shared.undo", { token: removed.undo!.token }, store.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "used"
    })
    expect((await outboxOf(store.workspace)).filter((e) => e.event === "order.updated" && e.cancelled)).toHaveLength(
      1
    )

    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await writes.get()).toHaveLength(0)

    // A tag nobody changes is no change; Insyte's own markers are not the operator's to set.
    expect(ok(await rpc("Orders.tag", { ids: [open.id], add: ["terugbellen"], remove: [] }, store.cookie)))
      .toMatchObject({ orders: [], undo: null })
    expect(failure(await rpc("Orders.tag", { ids: [open.id], add: ["at_risk"], remove: [] }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { tags: "system" } })
    expect(failure(await rpc("Orders.tag", { ids: ["ord_none"], add: ["x"], remove: [] }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })
  })

  it("marks fulfilled with undo, edits the address and the internal note, and cancels without undo", async () => {
    const store = await importedStore("ord-flow")
    const open = await orderNumbered(store.cookie, "#1001")
    const shipped = await orderNumbered(store.cookie, "#1002")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)

    expect(failure(await rpc("Orders.markFulfilled", { ids: [shipped.id] }, store.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "fulfilled"
    })
    const fulfilled = ok(await rpc("Orders.markFulfilled", { ids: [open.id] }, store.cookie))
    expect(fulfilled.orders[0]).toMatchObject({ status: "shipped", fulfillmentStatus: "fulfilled" })
    ok(await rpc("Shared.undo", { token: fulfilled.undo!.token }, store.cookie))
    expect(ok(await rpc("Orders.get", { id: open.id }, store.cookie)).order).toMatchObject({
      status: "paid",
      fulfillmentStatus: "unfulfilled"
    })

    const address = {
      line1: "Prinsengracht 263",
      line2: null,
      city: "Amsterdam",
      postcode: "1016 GV",
      region: "",
      country: "nl"
    }
    ok(await rpc("Orders.updateShipping", { id: open.id, address }, store.cookie))
    expect(ok(await rpc("Orders.get", { id: open.id }, store.cookie)).shippingAddress).toMatchObject({
      line1: "Prinsengracht 263",
      postcode: "1016 GV",
      country: "NL",
      region: null
    })
    expect(
      failure(await rpc("Orders.updateShipping", { id: open.id, address: { ...address, city: " " } }, store.cookie))
    )
      .toMatchObject({ _tag: "Invalid", fields: { "address.city": "required" } })

    // The internal note is Insyte's: no outbox, nothing to Shopify; the shopper's own note is left as it is.
    ok(await rpc("Orders.setNote", { id: open.id, body: "  Klant belt terug na 17:00  " }, store.cookie))
    const noted = ok(await rpc("Orders.get", { id: open.id }, store.cookie))
    expect(noted.internalNote?.body).toBe("Klant belt terug na 17:00")
    expect(noted.note).toBeNull()
    ok(await rpc("Orders.setNote", { id: open.id, body: "" }, store.cookie))
    expect(ok(await rpc("Orders.get", { id: open.id }, store.cookie)).internalNote).toBeNull()

    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [shipping] = await writes.get()
    await shipping!.waitForStatus("complete")
    expect(await shipping!.getOutput()).toEqual([{ orderId: open.id, outcome: "sent", reason: null }])

    // Irreversible: no undo token, and Shopify hears it at once, without waiting out a window.
    const cancelled = ok(await rpc("Orders.cancel", { ids: [open.id], restock: true, notify: true }, store.cookie))
    expect(cancelled.undo).toBeNull()
    expect(cancelled.orders[0]?.status).toBe("cancelled")
    await relay(store.workspace)
    const all = await writes.get()
    expect(all).toHaveLength(2)
    await all[1]!.waitForStatus("complete")
    expect(await all[1]!.getOutput()).toEqual([{ orderId: open.id, outcome: "sent", reason: null }])
    expect(failure(await rpc("Orders.cancel", { ids: [open.id], restock: true, notify: true }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "closed" })
    expect(failure(await rpc("Orders.markFulfilled", { ids: [open.id] }, store.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "closed"
    })
  })

  it("reads the order again when Shopify refuses the write", async () => {
    const store = await importedStore("ord-refuse", "refuse")
    const open = await orderNumbered(store.cookie, "#1001")
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    ok(await rpc("Orders.tag", { ids: [open.id], add: ["spoed"], remove: [] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [instance] = await writes.get()
    await instance!.waitForStatus("complete")
    expect(await instance!.getOutput()).toEqual([
      { orderId: open.id, outcome: "refused", reason: "Deze bestelling kan niet worden gewijzigd" }
    ])
    expect(ok(await rpc("Orders.get", { id: open.id }, store.cookie)).order.tags).toEqual([])
  })
})
