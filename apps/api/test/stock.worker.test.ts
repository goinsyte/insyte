import { RECORDED_STOCK } from "@insyte/integrations-shopify/RecordedBulk"
import { introspectWorkflowInstance } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Stock that is real (M6.3 inventory per location, M7 9.3 `Products.lowStock`), against Shopify's recorded twin. The
 * first import reads every variant's count per location, so a store's stock is there before any webhook; the shirt's
 * L is counted at two locations, on two pages, and is not sold out between them. The tote bag is not tracked in
 * Shopify, so it has no stock. A count is only overwritten by one as new: a webhook older than the import is ignored,
 * one reported later survives the import running again, and on a tie the later writer wins. A count the import no
 * longer sees is removed. What runs low is read against the threshold, on the console's RPC, through `/v1` and MCP,
 * and never past the reader's stores.
 */

// A JSON-RPC or REST answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

let delivery = 0
/** Shopify's report about one location's count of one inventory item: a new count, or the item leaving it. */
const hook = (shop: string, topic: string, body: Record<string, unknown>) =>
  call("http://api.public.test/hooks/shopify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": `stk-${run}-${++delivery}`,
      "x-shopify-hmac-sha256": "valid"
    },
    body: JSON.stringify(body)
  })
const level = (shop: string, item: number, location: number, available: number, updatedAt?: string) =>
  hook(shop, "inventory_levels/update", {
    inventory_item_id: item,
    location_id: location,
    available,
    ...(updatedAt === undefined ? {} : { updated_at: updatedAt })
  })

type Store = Awaited<ReturnType<typeof importedStore>>
type Mirror = {
  inbound: Array<{ topic: string; processed: boolean }>
  stockouts: Array<{ product: string; variant: string; open: boolean }>
}

const mirrorOf = async (store: Store) =>
  (await (await call(`http://api.test/api/__dev/stores/mirror?workspace=${store.workspace}&store=${store.storeId}`))
    .json()) as Mirror

/** The store once every delivery sent is applied (the queue consumer runs on its own): its stock-outs. */
const applied = async (store: Store) => {
  for (let i = 0; i < 100; i++) {
    const mirror = await mirrorOf(store)
    const levels = mirror.inbound.filter((e) => e.topic.startsWith("inventory_levels/"))
    if (levels.length >= delivery && levels.every((e) => e.processed)) return mirror.stockouts
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("the deliveries were not applied")
}

const product = async (store: Store, title: string) => {
  const row = ok(await rpc("Products.list", { limit: 50 }, store.cookie)).rows.find((p) => p.title === title)!
  return ok(await rpc("Products.get", { id: row.id }, store.cookie))
}

/** Each variant with its counts, place by place. */
const levelsOf = async (store: Store, title: string) =>
  (await product(store, title)).variants.map((v) => [v.title, v.levels.map((l) => [l.locationId, l.available])])

let imports = 0
const reimport = async (store: Store) => {
  const id = `stk-again-${run}-${++imports}`
  await using instance = await introspectWorkflowInstance(env.SHOPIFY_BACKFILL, id)
  await instance.modify(async (m) => {
    await m.disableSleeps()
  })
  await env.SHOPIFY_BACKFILL.create({ id, params: { workspaceId: store.workspace, storeId: store.storeId } })
  await instance.waitForStatus("complete")
}

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

/**
 * Orders for the shirt's L placed some days before now, written through the mirror's own writer: the low-stock
 * list's windows (sold in 30 days, open among 90) are read against them, whatever day the tests run on.
 */
let placed = 0
const placeOrders = async (store: Store, orders: ReadonlyArray<{ status: string; days: number; quantity: number }>) => {
  const rows = orders.map((o, i) => ({ id: `9${++placed}${i}`, ...o }))
  const response = await call(
    `http://api.test/api/__dev/facts/orders?workspace=${store.workspace}&store=${store.storeId}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batch: {
          orders: rows.map((o) => ({
            shopify_id: o.id,
            number: `#S${o.id}`,
            customer_shopify_id: null,
            customer_name: "Klant S",
            customer_email: null,
            status: o.status,
            payment_status: "paid",
            fulfillment_status: "unfulfilled",
            total_minor: 4995 * o.quantity,
            subtotal_minor: 4995 * o.quantity,
            shipping_minor: 0,
            tax_minor: 0,
            discounts_minor: 0,
            currency: "EUR",
            payment_gateway: null,
            card_last4: null,
            shipping_address: { country: "NL" },
            tags: [],
            note: null,
            channel: "web",
            referral_code: null,
            placed_at: ago(o.days),
            paid_at: ago(o.days),
            shipped_at: null,
            cancelled_at: o.status === "cancelled" ? ago(o.days) : null,
            refunded_at: null,
            external_updated_at: ago(o.days),
            raw: {}
          })),
          lines: rows.map((o) => ({
            shopify_id: `${o.id}1`,
            order_shopify_id: o.id,
            product_shopify_id: "1",
            variant_shopify_id: "12",
            sku: "LIN-L",
            title: "Linnen overhemd",
            variant_title: "L",
            quantity: o.quantity,
            unit_price_minor: 4995
          }))
        }
      })
    }
  )
  expect(response.status).toBe(200)
}

const mcp = async (secret: string, name: string, args: Record<string, unknown>) => {
  const response = await call("http://api.public.test/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
      authorization: `Bearer ${secret}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
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

describe("stock that is real", () => {
  let store: Store

  it("reads every variant's stock per location in the first import", async () => {
    store = await importedStore("stk")
    const linen = await product(store, "Linnen overhemd")
    expect(linen.product).toMatchObject({ available: RECORDED_STOCK[11] + RECORDED_STOCK[12], stock: "available" })
    expect(
      linen.variants.map((v) => [v.title, v.tracked, v.available, v.levels.map((l) => [l.locationId, l.available])])
    )
      .toEqual([
        ["M", true, 24, [["900", 24]]],
        ["L", true, 38, [["901", 38], ["900", 0]]]
      ])
    expect(linen.lowStockAt).toBe(12)
    // The bag is not tracked: Shopify's zero is no stock to judge, and no sold-out period.
    const bag = await product(store, "Canvas tas")
    expect(bag.product).toMatchObject({ available: null, stock: null })
    expect(bag.variants.map((v) => [v.tracked, v.available])).toEqual([[false, null]])
    // The list says the same, with the delivery time where an order arrived: the sweater's took five days.
    const rows = ok(await rpc("Products.list", { limit: 50 }, store.cookie)).rows
    expect(rows.map((p) => [p.title, p.available, p.stock, p.avgDeliveryDays])).toEqual([
      ["Canvas tas", null, null, null],
      ["Linnen overhemd", 62, "available", null],
      ["Wollen trui", 40, "available", 5]
    ])
    expect(ok(await rpc("Products.lowStock", {}, store.cookie))).toMatchObject({ threshold: 12, rows: [] })
    // L was at nothing at one location while its other page was still to come: no stock-out for it.
    expect(await applied(store)).toEqual([])
  })

  it("writes a count only over an older one, and drops what the import no longer sees", async () => {
    // Older than the import's count of M: ignored. As old: the later writer wins. L's, reported now, is newer.
    expect((await level(store.shop, 11, 900, 1, "2026-09-10T08:00:00Z")).status).toBe(200)
    await applied(store)
    expect((await level(store.shop, 11, 900, 20, "2026-09-15T08:00:00Z")).status).toBe(200)
    expect((await level(store.shop, 12, 901, 2)).status).toBe(200)
    // An old count at a location the import does not know.
    expect((await level(store.shop, 21, 902, 5, "2026-09-01T08:00:00Z")).status).toBe(200)
    await applied(store)
    expect(await levelsOf(store, "Linnen overhemd")).toEqual([
      ["M", [["900", 20]]],
      ["L", [["901", 2], ["900", 0]]]
    ])
    expect(await levelsOf(store, "Wollen trui")).toEqual([["Default Title", [["900", 40], ["902", 5]]]])

    await reimport(store)
    // M's tie goes to the import, written after; L's newer count stays; the sweater's unseen one is gone.
    expect(await levelsOf(store, "Linnen overhemd")).toEqual([
      ["M", [["900", 24]]],
      ["L", [["901", 2], ["900", 0]]]
    ])
    expect(await levelsOf(store, "Wollen trui")).toEqual([["Default Title", [["900", 40]]]])
    const linen = (await product(store, "Linnen overhemd")).product
    expect(linen).toMatchObject({ available: 26, stock: "low" })
    // The supplier's dialog reads the same units and level (its "{n} bijbestellen").
    const supplier = ok(await rpc("Suppliers.get", { id: linen.supplierId! }, store.cookie))
    expect(supplier.products.find((p) => p.id === linen.id)).toMatchObject({ available: 26, stock: "low" })
    expect(await applied(store)).toEqual([])
  })

  it("says what runs low, on the RPC, through /v1 and MCP", async () => {
    // Oversold: Shopify's -3 is nothing on the shelf, and the sweater is sold out.
    expect((await level(store.shop, 21, 900, -3)).status).toBe(200)
    expect(await applied(store)).toEqual([{ product: "Wollen trui", variant: "Default Title", open: true }])
    const sweater = await product(store, "Wollen trui")
    expect(sweater.product).toMatchObject({ available: 0, stock: "out" })
    expect(sweater.variants.map((v) => [v.available, v.levels.map((l) => l.available)])).toEqual([[0, [-3]]])

    const low = ok(await rpc("Products.lowStock", {}, store.cookie))
    expect(low.rows.map((r) => [r.title, r.level, r.available, r.variants.map((v) => [v.title, v.available])]))
      .toEqual([
        ["Wollen trui", "out", 0, [["Default Title", 0]]],
        ["Linnen overhemd", "low", 26, [["L", 2]]]
      ])
    expect(low.rows[1]).toMatchObject({ supplierName: "Atelier Noord", leadDays: 2 })
    // Orders placed relative to today: open from a day ago (3 sold) and from 40 days ago (out of the 30), a cancelled
    // one, and an open one from 120 days ago (out of both windows). What the recorded orders add stays the same.
    const before = low.rows[1]!
    await placeOrders(store, [
      { status: "paid", days: 1, quantity: 3 },
      { status: "shipped", days: 40, quantity: 1 },
      { status: "cancelled", days: 2, quantity: 5 },
      { status: "paid", days: 120, quantity: 4 }
    ])
    const after = ok(await rpc("Products.lowStock", {}, store.cookie)).rows[1]!
    expect(after).toMatchObject({
      title: "Linnen overhemd",
      openOrders: before.openOrders + 2,
      soldLast30: before.soldLast30 + 3
    })
    expect(after.daysLeft).toBeCloseTo(26 / (after.soldLast30 / 30))
    expect(ok(await rpc("Products.lowStock", { limit: 1 }, store.cookie)).rows.map((r) => r.title))
      .toEqual(["Wollen trui"])
    // A threshold of the caller's own: the bag, untracked, never shows.
    expect(ok(await rpc("Products.lowStock", { threshold: 1000 }, store.cookie)).rows.map((r) => r.title))
      .toEqual(["Wollen trui", "Linnen overhemd"])

    const { secret } = ok(
      await rpc("ApiKeys.create", {
        label: "Voorraad",
        access: { kind: "role", roleId: "view" },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: true
      }, store.cookie)
    )
    const rest = await call("http://api.public.test/v1/products/low-stock", {
      headers: { authorization: `Bearer ${secret}` }
    })
    expect(rest.status).toBe(200)
    const body = await rest.json() as Json
    expect(body).toMatchObject({ threshold: 12 })
    expect(body.data).toMatchObject([{ title: "Wollen trui", stock: "out", available: 0 }, {
      title: "Linnen overhemd",
      stock: "low",
      available: 26,
      variants: [{ title: "L", available: 2 }],
      open_orders: after.openOrders,
      sold_last_30_days: after.soldLast30,
      supplier: { name: "Atelier Noord" },
      lead_days: 2
    }])
    const products = await (await call("http://api.public.test/v1/products", {
      headers: { authorization: `Bearer ${secret}` }
    })).json() as Json
    expect(products.data.find((p: Json) => p.title === "Linnen overhemd")).toMatchObject({
      available: 26,
      stock: "low"
    })
    expect(products.data.find((p: Json) => p.title === "Canvas tas")).toMatchObject({ available: null, stock: null })
    const tool = await mcp(secret, "list_low_stock", { threshold: 40 })
    expect(tool.threshold).toBe(40)
    expect(tool.data.map((p: Json) => p.title)).toEqual(["Wollen trui", "Linnen overhemd"])
  })

  it("forgets a count Shopify no longer keeps at a location", async () => {
    expect((await hook(store.shop, "inventory_levels/disconnect", { inventory_item_id: 11, location_id: 900 })).status)
      .toBe(200)
    await applied(store)
    // M has no count left: no units, and not judged; the shirt is L's.
    const linen = await product(store, "Linnen overhemd")
    expect(linen.variants.map((v) => [v.title, v.available, v.levels.length])).toEqual([["M", null, 0], ["L", 2, 2]])
    expect(linen.product).toMatchObject({ available: 2, stock: "low" })
    expect(ok(await rpc("Products.lowStock", {}, store.cookie)).rows.find((r) => r.title === "Linnen overhemd"))
      .toMatchObject({ available: 2, variants: [{ title: "L", available: 2 }] })
  })

  it("asks for a restock once while that ticket is open", async () => {
    const linen = await product(store, "Linnen overhemd")
    const ask = { title: "Linnen overhemd bijbestellen", labels: ["Leverancier"], once: `restock:${linen.product.id}` }
    const first = ok(await rpc("Tickets.create", ask, store.cookie))
    expect(first.undo).not.toBeNull()
    const again = ok(await rpc("Tickets.create", ask, store.cookie))
    expect(again.undo).toBeNull()
    expect(again.tickets.map((t) => t.number)).toEqual(first.tickets.map((t) => t.number))
    ok(await rpc("Tickets.setStatus", { ids: [first.tickets[0]!.id], status: "done" }, store.cookie))
    const later = ok(await rpc("Tickets.create", ask, store.cookie))
    expect(later.undo).not.toBeNull()
    expect(later.tickets[0]!.number).not.toBe(first.tickets[0]!.number)
  })

  it("shows none of a store's stock to a member or a key held to another store", async () => {
    const email = `stk-${run}-held@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: ["sto_elsewhere"] }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const held = await join(email)
    expect(ok(await rpc("Products.lowStock", { threshold: 1000 }, held)).rows).toEqual([])
    expect(ok(await rpc("Products.lowStock", { threshold: 1000, storeId: store.storeId }, held)).rows).toEqual([])
    expect(ok(await rpc("Products.list", { limit: 50 }, held)).rows).toEqual([])
    const linen = await product(store, "Linnen overhemd")
    expect(failure(await rpc("Products.get", { id: linen.product.id }, held))).toMatchObject({ _tag: "NotFound" })
    expect(ok(await rpc("Products.lowStock", { threshold: 1000 }, store.cookie)).rows).toHaveLength(2)

    const { secret } = ok(
      await rpc("ApiKeys.create", {
        label: "Andere winkel",
        access: { kind: "role", roleId: "view" },
        stores: ["sto_elsewhere"],
        expiresInDays: 30,
        ips: [],
        agent: true
      }, store.cookie)
    )
    const headers = { authorization: `Bearer ${secret}` }
    const rest = await call("http://api.public.test/v1/products/low-stock?threshold=1000", { headers })
    expect(rest.status).toBe(200)
    expect(((await rest.json()) as Json).data).toEqual([])
    const products = await call("http://api.public.test/v1/products", { headers })
    expect(((await products.json()) as Json).data).toEqual([])
    expect((await mcp(secret, "list_low_stock", { threshold: 1000 })).data).toEqual([])
  })
})
