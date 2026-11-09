import { describe, expect, it } from "vitest"
import { failure, ok } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { rpc } from "./support.ts"

/*
 * Suppliers (step 10.1, M8.1). Each Shopify vendor becomes a supplier on import, with its products, except the shop's
 * own name (Shopify's default vendor). Their standing counts the orders of their products. A supplier is made by hand,
 * edited, paused, given products and removed, each with one Undo; a removed vendor is not made again by the next sync.
 */

const names = async (cookie: string, input: Parameters<typeof rpc<"Suppliers.list">>[1] = {}) =>
  ok(await rpc("Suppliers.list", input, cookie)).rows.map((r) => r.name)

const productNamed = async (cookie: string, title: string) =>
  ok(await rpc("Products.list", { limit: 50 }, cookie)).rows.find((p) => p.title === title)!

const undo = async (cookie: string, token: string | undefined) =>
  ok(await rpc("Shared.undo", { token: token! }, cookie))

describe("suppliers", () => {
  it("makes a supplier of each Shopify vendor, with its products and its standing", async () => {
    const store = await importedStore("sup-vendors")
    const list = ok(await rpc("Suppliers.list", {}, store.cookie))
    expect(list.rows.map((r) => [r.name, r.vendor, r.stats])).toEqual([
      // #1001 paid and #1003 shipped are open; #1003 shipped on time; nothing is late.
      ["Atelier Noord", "atelier noord", { products: 1, open: 2, delayed: 0, shipped: 1, onTime: 1 }],
      // #1002 is delivered.
      ["Wolhuis", "wolhuis", { products: 1, open: 0, delayed: 0, shipped: 1, onTime: 1 }]
    ])
    expect(list.counts).toEqual({ total: 2, delayedOrders: 0, liveStock: 0, portalActive: 0 })
    expect((await productNamed(store.cookie, "Linnen overhemd")).supplierName).toBe("Atelier Noord")
    expect((await productNamed(store.cookie, "Canvas tas")).supplierName).toBeNull()

    const atelier = list.rows[0]!
    const detail = ok(await rpc("Suppliers.get", { id: atelier.id }, store.cookie))
    expect(detail.products.map((p) => p.title)).toEqual(["Linnen overhemd"])
    expect(detail.delayedOrders).toEqual([])
    expect(failure(await rpc("Suppliers.get", { id: "sup_none" }, store.cookie))).toMatchObject({ _tag: "NotFound" })
  })

  it("makes, edits, pauses, assigns and removes, each with one Undo", async () => {
    const store = await importedStore("sup-commands")
    const bag = await productNamed(store.cookie, "Canvas tas")
    const input = {
      name: "Tassen & Co",
      contactEmail: "orders@tassen.example",
      contactPhone: "",
      description: "Tassen"
    }

    expect(failure(await rpc("Suppliers.create", { ...input, contactEmail: "geen-adres" }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { contactEmail: "format" } })
    expect(failure(await rpc("Suppliers.create", { ...input, name: "atelier noord" }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { name: "taken" } })
    const made = ok(await rpc("Suppliers.create", input, store.cookie))
    const tassen = made.suppliers[0]!
    expect(tassen).toMatchObject({ name: "Tassen & Co", forwardEmail: "orders@tassen.example", vendor: null })
    await undo(store.cookie, made.undo?.token)
    expect(await names(store.cookie)).toEqual(["Atelier Noord", "Wolhuis"])

    const again = ok(await rpc("Suppliers.create", input, store.cookie)).suppliers[0]!
    const assigned = ok(
      await rpc("Suppliers.assignProducts", {
        supplierId: again.id,
        productIds: [bag.id]
      }, store.cookie)
    )
    expect(assigned.suppliers[0]!.stats.products).toBe(1)
    expect((await productNamed(store.cookie, "Canvas tas")).supplierName).toBe("Tassen & Co")
    await undo(store.cookie, assigned.undo?.token)
    expect((await productNamed(store.cookie, "Canvas tas")).supplierName).toBeNull()

    // Moving a product: the new supplier is the primary one, and Undo gives it back.
    const linen = await productNamed(store.cookie, "Linnen overhemd")
    const moved = ok(
      await rpc("Suppliers.assignProducts", { supplierId: again.id, productIds: [linen.id] }, store.cookie)
    )
    expect((await productNamed(store.cookie, "Linnen overhemd")).supplierName).toBe("Tassen & Co")
    await undo(store.cookie, moved.undo?.token)
    expect((await productNamed(store.cookie, "Linnen overhemd")).supplierName).toBe("Atelier Noord")

    const ids = ok(await rpc("Suppliers.list", {}, store.cookie)).rows.map((r) => r.id)
    const paused = ok(await rpc("Suppliers.setPaused", { ids, paused: true }, store.cookie))
    expect(paused.suppliers.every((s) => s.pausedAt !== null)).toBe(true)
    expect(await names(store.cookie, { notPaused: true })).toEqual([])
    await undo(store.cookie, paused.undo?.token)
    expect(await names(store.cookie, { notPaused: true })).toEqual(["Atelier Noord", "Tassen & Co", "Wolhuis"])

    const edited = ok(
      await rpc("Suppliers.update", {
        id: again.id,
        autoForward: true,
        forwardChannel: "api",
        contactPhone: "+31 20 123 4567"
      }, store.cookie)
    )
    expect(edited.suppliers[0]).toMatchObject({
      autoForward: true,
      forwardChannel: "api",
      contactPhone: "+31 20 123 4567"
    })
    await undo(store.cookie, edited.undo?.token)
    expect(ok(await rpc("Suppliers.get", { id: again.id }, store.cookie)).supplier).toMatchObject({
      autoForward: false,
      forwardChannel: "email",
      contactPhone: null
    })
  })

  it("removes a supplier, and the next sync does not make the vendor again", async () => {
    const store = await importedStore("sup-remove")
    const wool = await productNamed(store.cookie, "Wollen trui")
    const wolhuis = ok(await rpc("Suppliers.list", {}, store.cookie)).rows.find((r) => r.name === "Wolhuis")!

    const removed = ok(await rpc("Suppliers.remove", { id: wolhuis.id }, store.cookie))
    expect(await names(store.cookie)).toEqual(["Atelier Noord"])
    await undo(store.cookie, removed.undo?.token)
    expect((await productNamed(store.cookie, "Wollen trui")).supplierName).toBe("Wolhuis")

    ok(await rpc("Suppliers.remove", { id: wolhuis.id }, store.cookie))
    ok(await rpc("Products.sync", { id: wool.id }, store.cookie))
    expect(await names(store.cookie)).toEqual(["Atelier Noord"])
    expect((await productNamed(store.cookie, "Wollen trui")).supplierName).toBeNull()
  })
})
