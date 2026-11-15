import { describe, expect, it } from "vitest"
import { ok, pastUndo, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * "Gegevens wissen" for a shopper whose orders have a case of every kind on them: a chargeback opened by hand, a return, a
 * claim for a damaged item (a quality case) and a ticket. Every table the erasure writes keeps its checks (a
 * chargeback's customer name may not be empty, `chargebacks_customer_name_check`), so the erasure completes instead
 * of rolling back, and the shopper is nowhere in the workspace after it.
 */

interface Census {
  readonly found: ReadonlyArray<{ readonly table: string; readonly column: string }>
}

const census = async (workspace: string, find: string): Promise<Census> =>
  (await (await call(
    `http://api.test/api/__dev/privacy/census?workspace=${workspace}&find=${encodeURIComponent(find)}`
  )).json()) as Census

describe("a shopper's erasure", () => {
  it("completes with a manual chargeback, a return, a claim and a ticket on their orders, and leaves them nowhere", async () => {
    const store = await importedStore("erasure", "eras")
    const customers = ok(await rpc("Customers.list", { limit: 50 }, store.cookie)).rows
    const orders = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows
    // A shopper with two items to send back: a return on one, a claim on the other (the same line twice if need be).
    const found = await (async () => {
      for (const shopper of customers) {
        if (shopper.email === null || shopper.name.length < 5) continue
        const items: Array<{ orderId: string; lineId: string }> = []
        for (const o of orders.filter((o) => o.customerId === shopper.id)) {
          for (const line of ok(await rpc("Orders.get", { id: o.id }, store.cookie)).lines) {
            for (let n = 0; n < Math.min(line.quantity, 2); n++) items.push({ orderId: o.id, lineId: line.id })
          }
        }
        if (items.length >= 2) return { shopper, items }
      }
      return undefined
    })()
    expect(found).toBeDefined()
    const { shopper, items } = found!
    const order = { id: items[0]!.orderId }
    const email = shopper.email!

    ok(
      await rpc("Chargebacks.createManual", {
        provider: "stripe",
        customer: { id: shopper.id, name: shopper.name },
        amountMinor: 4_500,
        reasonCode: "not_received",
        note: `${shopper.name} zegt dat het pakket nooit kwam`,
        orderId: order.id
      }, store.cookie)
    )
    ok(
      await rpc("Returns.start", {
        orderId: items[0]!.orderId,
        lines: [{ lineId: items[0]!.lineId, qty: 1 }],
        reasonId: "too_small",
        requested: "refund"
      }, store.cookie)
    )
    const claim = ok(
      await rpc("Returns.start", {
        orderId: items[1]!.orderId,
        lines: [{ lineId: items[1]!.lineId, qty: 1 }],
        reasonId: "damaged",
        requested: "replacement"
      }, store.cookie)
    ).returns[0]!
    expect(claim).toMatchObject({ kind: "claim", quality: true })
    const ticket = ok(
      await rpc("Tickets.create", {
        title: `Bestelling van ${shopper.name}`,
        description: `Antwoord naar ${email}`,
        related: { type: "order", id: order.id }
      }, store.cookie)
    ).tickets[0]!
    ok(await rpc("Tickets.comment", { id: ticket.id, body: `${shopper.name} belde (${email})` }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const before = [
      ...(await census(store.workspace, email)).found,
      ...(await census(store.workspace, shopper.name)).found
    ]
    expect(before.map((f) => f.table)).toEqual(expect.arrayContaining(["chargebacks", "returns", "tickets"]))

    const erased = ok(await rpc("Privacy.requestErasure", { email }, store.cookie))
    const requests = ok(await rpc("Privacy.requests", undefined, store.cookie)).shoppers
    expect(requests.find((r) => r.id === erased.id)).toMatchObject({ kind: "erasure", state: "done" })

    // The cases stay, for the figures, without who they were about.
    const chargeback = ok(await rpc("Chargebacks.list", {}, store.cookie)).rows.find((c) => c.orderId === order.id)!
    expect(chargeback.amountMinor).toBe(4_500)
    expect(chargeback.customerName).not.toContain(shopper.name)
    expect(ok(await rpc("Returns.get", { id: claim.id }, store.cookie)).record).toMatchObject({ kind: "claim" })
    expect((await census(store.workspace, email)).found).toEqual([])
    expect((await census(store.workspace, shopper.name)).found).toEqual([])
  })
})
