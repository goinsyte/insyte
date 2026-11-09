import { describe, expect, it } from "vitest"
import { failure, ok, person } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * The read-only lists (step 8.4, M6.4) over a store imported from the recorded twin: Bestellingen, Producten and
 * Klanten page by keyset with their counts, filter through the whitelist (an unknown field is refused, never
 * interpolated), search, and open one record. The panel counts the orders' cuts; the one search finds all three
 * kinds; a key reads the same orders through `/v1` and through MCP's `list_orders`.
 */

// A JSON-RPC or REST answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const rule = (field: string, op: string, value: string | Array<string>) => ({
  kind: "group" as const,
  id: "root",
  join: "and" as const,
  children: [{ kind: "rule" as const, id: "r", field, op: op as "any", value }]
})

/** The journey's store: the recorded twin imported into the caller's workspace (`POST /api/__dev/stores/seed`). */
const seed = (cookie?: string) =>
  call("http://api.test/api/__dev/stores/seed", { method: "POST", headers: cookie === undefined ? {} : { cookie } })

describe("the commerce lists", () => {
  let store = { cookie: "", workspace: "", shop: "", storeId: "" }

  it("pages the orders newest first, with the counts", async () => {
    store = await importedStore("lists")
    const first = ok(await rpc("Orders.list", { limit: 2 }, store.cookie))
    expect(first.rows.map((o) => o.number)).toEqual(["#1005", "#1004"])
    expect(first.counts).toEqual({
      total: 5,
      status: { paid: 1, delivered: 1, shipped: 1, refunded: 1, cancelled: 1 }
    })
    const second = ok(await rpc("Orders.list", { limit: 2, cursor: first.nextCursor! }, store.cookie))
    expect(second.rows.map((o) => o.number)).toEqual(["#1003", "#1002"])
    const last = ok(await rpc("Orders.list", { limit: 2, cursor: second.nextCursor! }, store.cookie))
    expect(last.rows.map((o) => o.number)).toEqual(["#1001"])
    expect(last.nextCursor).toBeNull()
    expect(first.rows[0]).toMatchObject({ status: "cancelled", lineCount: 2, totalMinor: 2450, currency: "EUR" })
    expect(second.rows[0]).toMatchObject({ hasTracking: true, carrier: "PostNL" })
  })

  it("filters through the whitelist, searches, and refuses what it does not know", async () => {
    const shipped = ok(await rpc("Orders.list", { filter: rule("status", "any", ["shipped"]) }, store.cookie))
    expect(shipped.rows.map((o) => o.number)).toEqual(["#1003"])
    expect(shipped.counts.total).toBe(1)
    const big = ok(await rpc("Orders.list", { filter: rule("total", "gt", "50") }, store.cookie))
    expect(big.rows.map((o) => o.number)).toEqual(["#1002"])
    const searched = ok(await rpc("Orders.list", { q: "1002" }, store.cookie))
    expect(searched.rows.map((o) => o.number)).toEqual(["#1002"])
    // An unfinished rule says nothing yet: everything matches.
    expect(ok(await rpc("Orders.list", { filter: rule("number", "contains", " ") }, store.cookie)).counts.total).toBe(5)
    expect(failure(await rpc("Orders.list", { filter: rule("raw; drop table orders", "any", ["x"]) }, store.cookie)))
      .toMatchObject({ _tag: "FilterFieldUnknown" })
    expect(failure(await rpc("Orders.list", { cursor: "not-a-cursor" }, store.cookie))).toMatchObject({
      _tag: "CursorInvalid"
    })
  })

  it("opens an order with its lines, its customer, parcels and refunds", async () => {
    const [delivered] = ok(await rpc("Orders.list", { q: "1002" }, store.cookie)).rows
    const detail = ok(await rpc("Orders.get", { id: delivered!.id }, store.cookie))
    expect(detail.order.status).toBe("delivered")
    expect(detail.lines).toMatchObject([{ title: "Wollen trui", quantity: 1, unitPriceMinor: 8900 }])
    expect(detail.lines[0]!.imageUrl).toMatch(/^https:\/\/images\.unsplash\.com\/photo-1620799140408/)
    expect(detail.customer).toEqual({ ordersCount: 2, lifetimeValueMinor: 13895, currency: "EUR" })
    expect(detail.fulfilments).toMatchObject([{ carrier: "PostNL", trackingStatus: "delivered" }])
    const [refunded] = ok(await rpc("Orders.list", { q: "1004" }, store.cookie)).rows
    expect(ok(await rpc("Orders.get", { id: refunded!.id }, store.cookie)).refunds).toMatchObject([
      { amountMinor: 2450, note: "Te laat" }
    ])
    expect(failure(await rpc("Orders.get", { id: "ord_none" }, store.cookie))).toMatchObject({ _tag: "NotFound" })
  })

  it("lists the products by title and the customers by name", async () => {
    const products = ok(await rpc("Products.list", {}, store.cookie))
    expect(products.rows.map((p) => p.title)).toEqual(["Canvas tas", "Linnen overhemd", "Wollen trui"])
    expect(products.rows[1]).toMatchObject({ variantCount: 2, priceMinMinor: 4995, priceMaxMinor: 4995 })
    const linen = ok(await rpc("Products.get", { id: products.rows[1]!.id }, store.cookie))
    expect(linen.variants.map((v) => v.sku)).toEqual(["LIN-M", "LIN-L"])
    // The featured photograph first, then the rest in Shopify's order, each once.
    expect(linen.images.map((url) => url.match(/photo-([\d-]+[a-f0-9]+)/)?.[1])).toEqual([
      "1713881587420-113c1c43e28a",
      "1713881676551-b16f22ce4719",
      "1713881604560-085594ed2c3d"
    ])
    expect(linen.descriptionHtml).toBe("<p>Linnen overhemd</p>")
    expect(ok(await rpc("Products.list", { q: "TAS-1" }, store.cookie)).rows.map((p) => p.title)).toEqual([
      "Canvas tas"
    ])
    const customers = ok(await rpc("Customers.list", {}, store.cookie))
    expect(customers.rows.map((c) => c.name)).toEqual(["Anna de Vries", "Bram Jansen", "Chen Li"])
    expect(customers.rows[0]).toMatchObject({ ordersCount: 2, lifetimeValueMinor: 13895 })
    const anna = ok(await rpc("Customers.get", { id: customers.rows[0]!.id }, store.cookie))
    expect(anna.orders.map((o) => o.number)).toEqual(["#1002", "#1001"])
  })

  it("counts the panel's order cuts, and finds every kind in one search", async () => {
    const counts = ok(await rpc("Nav.counts", { area: "orders" }, store.cookie))
    expect(counts).toEqual({
      "/orders?status=open": 1,
      "/orders?status=processing": 0,
      "/orders?status=shipped": 1,
      "/orders?status=cancelled": 1
    })
    const hits = ok(await rpc("Search.records", { q: "linnen" }, store.cookie))
    expect(hits.map((h) => [h.kind, h.title])).toEqual([["product", "Linnen overhemd"]])
    const people = ok(await rpc("Search.records", { q: "anna", kinds: ["customer"] }, store.cookie))
    expect(people).toMatchObject([{ kind: "customer", title: "Anna de Vries", href: `/customers/${people[0]!.id}` }])
  })

  it("reads the same orders with a key, through /v1 and MCP", async () => {
    const { secret } = ok(
      await rpc("ApiKeys.create", {
        label: "Rapportage",
        access: { kind: "role", roleId: "view" },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: true
      }, store.cookie)
    )
    const rest = await call("http://api.public.test/v1/orders?limit=10&status=shipped", {
      headers: { authorization: `Bearer ${secret}` }
    })
    expect(rest.status).toBe(200)
    const body = await rest.json() as Json
    expect(body).toMatchObject({ total: 1, next_cursor: null })
    expect(body.data[0]).toMatchObject({ number: "#1003", status: "shipped", total: { amount_minor: 4995 } })
    const all =
      await (await call("http://api.public.test/v1/orders", { headers: { authorization: `Bearer ${secret}` } }))
        .json() as Json
    const bad = await call("http://api.public.test/v1/orders?cursor=nope", {
      headers: { authorization: `Bearer ${secret}` }
    })
    expect(bad.status).toBe(400)
    expect((await bad.json() as Json).error.code).toBe("InvalidRequestV1")

    const response = await call("http://api.public.test/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/call",
        "Mcp-Name": "list_orders",
        authorization: `Bearer ${secret}`
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "list_orders",
          arguments: {},
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
    const tool = JSON.parse(message.result.content[0].text) as Json
    expect(tool.data.map((o: Json) => o.id)).toEqual(all.data.map((o: Json) => o.id))
  })

  it("seeds the recorded store into a person's workspace for the console's journey", async () => {
    const owner = await person("seed", "Seed B.V.")
    expect((await seed()).status).toBe(401)
    expect((await seed(owner.cookie)).status).toBe(200)
    // Twice is the same store, not a second one.
    const { storeId } = await (await seed(owner.cookie)).json() as Json
    const orders = ok(await rpc("Orders.list", {}, owner.cookie))
    expect(orders.counts.total).toBe(5)
    expect(new Set(orders.rows.map((o) => o.storeId))).toEqual(new Set([storeId]))
    expect(ok(await rpc("Products.list", {}, owner.cookie)).counts.total).toBe(3)
  })
})
