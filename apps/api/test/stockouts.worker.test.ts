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
})
