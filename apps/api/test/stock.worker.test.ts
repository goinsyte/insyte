import { RECORDED_STOCK } from "@insyte/integrations-shopify/RecordedBulk"
import { introspectWorkflowInstance } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Stock that is real (M6.3 inventory per location, M7 9.3 `Products.lowStock`), against Shopify's recorded twin. The
 * first import reads every variant's count per location, so a store's stock is there before any webhook; a count
 * Shopify reports later is not undone when the import runs again. What runs low is read against the threshold, on
 * the console's RPC, through `/v1` and MCP, and never past the reader's stores.
 */

// A JSON-RPC or REST answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

let delivery = 0
/** Shopify's report of one location's count of one inventory item. */
const level = (shop: string, item: number, location: number, available: number) =>
  call("http://api.public.test/hooks/shopify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": "inventory_levels/update",
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": `stk-${run}-${++delivery}`,
      "x-shopify-hmac-sha256": "valid"
    },
    body: JSON.stringify({ inventory_item_id: item, location_id: location, available })
  })

type Store = Awaited<ReturnType<typeof importedStore>>

const product = async (store: Store, title: string) => {
  const row = ok(await rpc("Products.list", { limit: 50 }, store.cookie)).rows.find((p) => p.title === title)!
  return ok(await rpc("Products.get", { id: row.id }, store.cookie))
}

/** A variant's count at one location once the queue consumer applied the deliveries (it runs on its own). */
const settled = async (store: Store, title: string, variant: string, location: string, want: number) => {
  for (let i = 0; i < 100; i++) {
    const found = (await product(store, title)).variants.find((v) => v.title === variant)
    if (found?.levels.find((l) => l.locationId === location)?.available === want) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${title} ${variant} never reached ${want} at ${location}`)
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
    expect(linen.variants.map((v) => [v.title, v.available, v.levels.map((l) => [l.locationId, l.available])]))
      .toEqual([
        ["M", 24, [["900", 24]]],
        ["L", 38, [["900", 30], ["901", 8]]]
      ])
    expect(linen.lowStockAt).toBe(12)
    // The list says the same, with the delivery time where an order arrived: the sweater's took five days.
    const rows = ok(await rpc("Products.list", { limit: 50 }, store.cookie)).rows
    expect(rows.map((p) => [p.title, p.available, p.stock, p.avgDeliveryDays])).toEqual([
      ["Canvas tas", 55, "available", null],
      ["Linnen overhemd", 62, "available", null],
      ["Wollen trui", 40, "available", 5]
    ])
    expect(ok(await rpc("Products.lowStock", {}, store.cookie))).toMatchObject({ threshold: 12, rows: [] })
  })

  it("keeps a count Shopify reported later when the import runs again", async () => {
    expect((await level(store.shop, 12, 901, 2)).status).toBe(200)
    await settled(store, "Linnen overhemd", "L", "901", 2)

    const id = `stk-again-${run}`
    await using instance = await introspectWorkflowInstance(env.SHOPIFY_BACKFILL, id)
    await instance.modify(async (m) => {
      await m.disableSleeps()
    })
    await env.SHOPIFY_BACKFILL.create({ id, params: { workspaceId: store.workspace, storeId: store.storeId } })
    await instance.waitForStatus("complete")

    const linen = await product(store, "Linnen overhemd")
    expect(linen.variants.map((v) => [v.title, v.levels.map((l) => [l.locationId, l.available])])).toEqual([
      ["M", [["900", 24]]],
      ["L", [["900", 30], ["901", 2]]]
    ])
    expect(linen.product.available).toBe(56)
  })

  it("says what runs low, on the RPC, through /v1 and MCP", async () => {
    expect((await level(store.shop, 11, 900, 5)).status).toBe(200)
    await settled(store, "Linnen overhemd", "M", "900", 5)

    const linen = await product(store, "Linnen overhemd")
    expect(linen.product).toMatchObject({ available: 37, stock: "low" })
    const low = ok(await rpc("Products.lowStock", {}, store.cookie))
    expect(low.rows.map((r) => [r.title, r.level, r.available, r.variants.map((v) => [v.title, v.available])]))
      .toEqual([["Linnen overhemd", "low", 37, [["M", 5]]]])
    // Order #1001 is paid and open, #1003 shipped; #1005 was cancelled.
    expect(low.rows[0]).toMatchObject({ openOrders: 2, supplierName: "Atelier Noord", leadDays: 2 })
    // A higher threshold of the caller's own takes in the sweater too.
    expect(ok(await rpc("Products.lowStock", { threshold: 40 }, store.cookie)).rows.map((r) => r.title))
      .toEqual(expect.arrayContaining(["Linnen overhemd", "Wollen trui"]))

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
    expect(body.data).toMatchObject([{
      title: "Linnen overhemd",
      stock: "low",
      available: 37,
      variants: [{ title: "M", available: 5 }],
      open_orders: 2,
      supplier: { name: "Atelier Noord" },
      lead_days: 2
    }])
    const products = await (await call("http://api.public.test/v1/products", {
      headers: { authorization: `Bearer ${secret}` }
    })).json() as Json
    expect(products.data.find((p: Json) => p.title === "Linnen overhemd")).toMatchObject({
      available: 37,
      stock: "low"
    })
    const tool = await mcp(secret, "list_low_stock", { threshold: 40 })
    expect(tool.threshold).toBe(40)
    expect(tool.data.map((p: Json) => p.title)).toEqual(expect.arrayContaining(["Linnen overhemd", "Wollen trui"]))
  })

  it("shows none of a store's stock to a member held to another store", async () => {
    const email = `stk-${run}-held@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: ["sto_elsewhere"] }] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const held = await join(email)
    expect(ok(await rpc("Products.lowStock", { threshold: 1000 }, held)).rows).toEqual([])
    expect(ok(await rpc("Products.lowStock", { threshold: 1000, storeId: store.storeId }, held)).rows).toEqual([])
    expect(ok(await rpc("Products.lowStock", { threshold: 1000 }, store.cookie)).rows).toHaveLength(3)
  })
})
