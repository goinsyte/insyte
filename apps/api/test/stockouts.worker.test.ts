import { describe, expect, it } from "vitest"
import { run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call } from "./support.ts"

/*
 * Stock-outs (step 11.7, M9.5), against Shopify's recorded twin: the linen shirt's M is inventory item 11. Shopify's
 * `inventory_levels/update` reports one location at a time; a period opens when the variant's stock across its
 * locations reaches nothing, and closes when it comes back. Nothing is typed: the trigger on `inventory_levels` keeps
 * them, whoever wrote the count.
 */

type Mirror = {
  inbound: Array<{ topic: string; processed: boolean }>
  stockouts: Array<{ product: string; variant: string; open: boolean }>
}

const mirrorOf = async (store: { workspace: string; storeId: string }) =>
  (await (await call(`http://api.test/api/__dev/stores/mirror?workspace=${store.workspace}&store=${store.storeId}`))
    .json()) as Mirror

let delivery = 0
/** Shopify's report of one location's count for the M shirt. */
const level = (shop: string, location: number, available: number) =>
  call("http://api.public.test/hooks/shopify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": "inventory_levels/update",
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": `sto-${run}-${++delivery}`,
      "x-shopify-hmac-sha256": "valid"
    },
    body: JSON.stringify({ inventory_item_id: 11, location_id: location, available })
  })

/** The stock-outs once every delivery sent is applied (the queue consumer runs on its own). */
const settled = async (store: { workspace: string; storeId: string }) => {
  for (let i = 0; i < 100; i++) {
    const mirror = await mirrorOf(store)
    const levels = mirror.inbound.filter((e) => e.topic === "inventory_levels/update")
    if (levels.length >= delivery && levels.every((e) => e.processed)) return mirror.stockouts
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("the deliveries were not applied")
}

describe("stock-outs", () => {
  it("opens a period when a variant's stock reaches nothing, and closes it when stock comes back", async () => {
    const store = await importedStore("sto", "upd")
    expect(await settled(store)).toEqual([])

    expect((await level(store.shop, 900, 0)).status).toBe(200)
    expect(await settled(store)).toEqual([{ product: "Linnen overhemd", variant: "M", open: true }])

    // Reported again at nothing: still the one period.
    expect((await level(store.shop, 900, 0)).status).toBe(200)
    expect(await settled(store)).toHaveLength(1)

    // Another location has three: the variant can be sold again.
    expect((await level(store.shop, 901, 3)).status).toBe(200)
    expect(await settled(store)).toEqual([{ product: "Linnen overhemd", variant: "M", open: false }])

    // Sold out everywhere again: a second period.
    expect((await level(store.shop, 901, 0)).status).toBe(200)
    expect(await settled(store)).toEqual([
      { product: "Linnen overhemd", variant: "M", open: false },
      { product: "Linnen overhemd", variant: "M", open: true }
    ])
  })

  it("closes a gift card's period once Shopify says it is one, and never opens one for it again", async () => {
    // A `gift-*` shop's canvas bag is a gift card the import read as stock at nothing, as a mirror made before gift
    // cards were known did: sold out.
    const store = await importedStore("gift", "gift")
    const send = (topic: string, body: unknown) =>
      call("http://api.public.test/hooks/shopify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-topic": topic,
          "x-shopify-shop-domain": store.shop,
          "x-shopify-webhook-id": `sto-${run}-${++delivery}`,
          "x-shopify-hmac-sha256": "valid"
        },
        body: JSON.stringify(body)
      })
    const applied = async (sent: number) => {
      for (let i = 0; i < 100; i++) {
        const mirror = await mirrorOf(store)
        if (mirror.inbound.length >= sent && mirror.inbound.every((e) => e.processed)) return mirror.stockouts
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error("the deliveries were not applied")
    }
    expect(await applied(0)).toEqual([{ product: "Canvas tas", variant: "Default Title", open: true }])

    // Read again, here by a webhook: a gift card, so its period ends.
    expect((await send("products/update", { id: 3 })).status).toBe(200)
    expect(await applied(1)).toEqual([{ product: "Canvas tas", variant: "Default Title", open: false }])

    // Its count at nothing again opens nothing.
    expect((await send("inventory_levels/update", { inventory_item_id: 31, location_id: 900, available: 0 })).status)
      .toBe(200)
    expect(await applied(2)).toEqual([{ product: "Canvas tas", variant: "Default Title", open: false }])
  })

  it("flags a gift card the import did not know, by the sweep's one read of the gift cards", async () => {
    // A mirror made before gift cards were read: the sweep's usual read sees nothing changed in Shopify, so only its one
    // read of the store's gift cards says what the canvas bag is.
    const store = await importedStore("gift-sweep", "gift")
    expect((await mirrorOf(store)).stockouts).toEqual([{ product: "Canvas tas", variant: "Default Title", open: true }])
    const sweep = () =>
      call(`http://api.test/api/__dev/stores/reconcile?workspace=${store.workspace}&store=${store.storeId}`, {
        method: "POST"
      })
    expect(await (await sweep()).json()).toEqual({ listed: true, swept: 1 })
    expect((await mirrorOf(store)).stockouts).toEqual([{
      product: "Canvas tas",
      variant: "Default Title",
      open: false
    }])
    // The next sweep reads it no more, and nothing opens again.
    expect(await (await sweep()).json()).toEqual({ listed: true, swept: 1 })
    expect((await mirrorOf(store)).stockouts).toEqual([{
      product: "Canvas tas",
      variant: "Default Title",
      open: false
    }])
  })
})
