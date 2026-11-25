import { describe, expect, it } from "vitest"
import { ok, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Shopify's webhooks and the reconcile sweep (step 8.3, M6.3), against the recorded twin. A delivery is verified on its
 * raw bytes and kept once; the consumer reads the object as Shopify holds it now, and an older read never rolls a
 * row back. The privacy topics clear a customer, purge a shop, and are kept with their 30 days. The sweep repairs a
 * change no webhook brought. An `upd-*` shop's Shopify changed since the import (`RECORDED_UPDATES`).
 */

interface Mirror {
  store: string | null
  orders: Array<{ number: string; status: string; paymentStatus: string; customerName: string }>
  products: Array<{ title: string; status: string }>
  customers: Array<{ name: string; email: string | null }>
  inbound: Array<{ topic: string; processed: boolean }>
  gdpr: Array<{ kind: string; completed: boolean }>
}

/** A connected, imported `upd-*` store of its own. */
const imported = (tag: string) => importedStore(tag, "upd")

const mirrorOf = async (store: { workspace: string; storeId: string }) =>
  (await (await call(`http://api.test/api/__dev/stores/mirror?workspace=${store.workspace}&store=${store.storeId}`))
    .json()) as Mirror

let delivery = 0
/** A webhook as Shopify sends it, to the API's public host. */
const hook = (shop: string, topic: string, body: unknown, options: { hmac?: string; id?: string } = {}) =>
  call("http://api.public.test/hooks/shopify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": options.id ?? `wh-${run}-${++delivery}`,
      "x-shopify-hmac-sha256": options.hmac ?? "valid"
    },
    body: JSON.stringify(body)
  })

/** Shopify's privacy topics with the payloads its docs print (shopify.dev, "Privacy law compliance"). */
const documented = (shop: string) => ({
  "customers/data_request": {
    shop_id: 954889,
    shop_domain: shop,
    orders_requested: [1, 2],
    customer: { id: 1, email: "klant1@example.com", phone: "555-625-1199" },
    data_request: { id: 9999 }
  },
  "customers/redact": {
    shop_id: 954889,
    shop_domain: shop,
    customer: { id: 1, email: "klant1@example.com", phone: "555-625-1199" },
    orders_to_redact: [1, 2]
  },
  "shop/redact": { shop_id: 954889, shop_domain: shop }
})

/** Until every delivery of the store is applied (the queue consumer runs on its own). */
const settled = async (store: { workspace: string; storeId: string }) => {
  for (let i = 0; i < 100; i++) {
    const mirror = await mirrorOf(store)
    if (mirror.inbound.every((e) => e.processed)) return mirror
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("the deliveries were not applied")
}

describe("Shopify's webhooks", () => {
  let store = { cookie: "", workspace: "", shop: "", storeId: "" }

  it("refuses a delivery it cannot verify, and keeps nothing of a shop it does not know", async () => {
    store = await imported("a")
    expect((await hook(store.shop, "orders/updated", { id: 1 }, { hmac: "forged" })).status).toBe(401)
    expect((await hook(`nobody-${run}.myshopify.com`, "orders/updated", { id: 1 })).status).toBe(200)
    expect((await mirrorOf(store)).inbound).toEqual([])
  })

  it("mirrors an order as Shopify holds it now, once per delivery, and never rolls one back", async () => {
    const id = `wh-${run}-order-1`
    expect((await hook(store.shop, "orders/updated", { id: 1 }, { id })).status).toBe(200)
    expect((await hook(store.shop, "orders/updated", { id: 1 }, { id })).status).toBe(200)
    // A stale read: Shopify's answer is older than what the import wrote.
    expect((await hook(store.shop, "orders/paid", { id: 2 })).status).toBe(200)
    const mirror = await settled(store)
    expect(mirror.inbound.filter((e) => e.topic === "orders/updated")).toHaveLength(1)
    expect(mirror.orders.find((o) => o.number === "#1001")).toMatchObject({ status: "shipped" })
    expect(mirror.orders.find((o) => o.number === "#1002")).toMatchObject({
      status: "delivered",
      paymentStatus: "paid"
    })
  })

  it("reads an order again from a fulfilment's delivery, by the payload's `order_id`", async () => {
    const fresh = await imported("f")
    expect((await hook(fresh.shop, "fulfillments/update", { id: 9, order_id: 1 })).status).toBe(200)
    const mirror = await settled(fresh)
    expect(mirror.orders.find((o) => o.number === "#1001")).toMatchObject({ status: "shipped" })
  })

  it("archives a deleted product, and answers the privacy topics", async () => {
    await hook(store.shop, "products/delete", { id: 3 })
    await hook(store.shop, "customers/redact", {
      shop_domain: store.shop,
      customer: { id: 2, email: "klant2@example.com" },
      orders_to_redact: [3, 4]
    })
    await hook(store.shop, "customers/data_request", { shop_domain: store.shop, customer: { id: 1 } })
    const mirror = await settled(store)
    expect(mirror.products.find((p) => p.title === "Canvas tas")).toMatchObject({ status: "archived" })
    expect(mirror.customers[1]).toEqual({ name: "", email: null })
    expect(mirror.orders.filter((o) => o.number === "#1003" || o.number === "#1004").map((o) => o.customerName))
      .toEqual(["", ""])
    expect(mirror.gdpr).toEqual([
      { kind: "customer_redact", completed: true },
      { kind: "data_request", completed: false }
    ])
  })

  it("disconnects on uninstall, and purges the shop when Shopify says so", async () => {
    await hook(store.shop, "app/uninstalled", { id: 1, domain: store.shop })
    expect((await settled(store)).store).toBe("disconnected")
    expect(ok(await rpc("Stores.list", undefined, store.cookie))[0]).toMatchObject({ status: "disconnected" })
    await hook(store.shop, "shop/redact", { shop_domain: store.shop })
    const mirror = await settled(store)
    expect({ orders: mirror.orders, products: mirror.products, customers: mirror.customers }).toEqual({
      orders: [],
      products: [],
      customers: []
    })
    expect(mirror.gdpr.at(-1)).toEqual({ kind: "shop_redact", completed: true })
  })

  // What Shopify's compliance check sends (shopify.dev, "Privacy law compliance"): each privacy topic with its documented
  // payload. A forged or missing signature is 401 on every topic; a shop Insyte does not know is 200 and kept nowhere;
  // a known shop's request is answered and kept with its 30 days.
  it("answers Shopify's compliance check on each privacy topic, with Shopify's documented payloads", async () => {
    const own = await imported("gdpr")
    for (const [topic, body] of Object.entries(documented(own.shop))) {
      expect((await hook(own.shop, topic, body, { hmac: "forged" })).status).toBe(401)
      expect((await hook(own.shop, topic, body, { hmac: "" })).status).toBe(401)
    }
    const nobody = `nobody-${run}.myshopify.com`
    for (const [topic, body] of Object.entries(documented(nobody))) {
      expect((await hook(nobody, topic, body)).status).toBe(200)
    }
    expect((await mirrorOf(own)).inbound).toEqual([])

    const asked = documented(own.shop)
    expect((await hook(own.shop, "customers/data_request", asked["customers/data_request"])).status).toBe(200)
    expect((await hook(own.shop, "customers/redact", asked["customers/redact"])).status).toBe(200)
    const redacted = await settled(own)
    expect(redacted.customers[0]).toEqual({ name: "", email: null })
    expect(redacted.orders.filter((o) => o.number === "#1001" || o.number === "#1002").map((o) => o.customerName))
      .toEqual(["", ""])
    expect(redacted.gdpr).toEqual([
      { kind: "data_request", completed: false },
      { kind: "customer_redact", completed: true }
    ])
    expect((await hook(own.shop, "shop/redact", asked["shop/redact"])).status).toBe(200)
    const purged = await settled(own)
    expect({ orders: purged.orders, customers: purged.customers }).toEqual({ orders: [], customers: [] })
    expect(purged.gdpr.at(-1)).toEqual({ kind: "shop_redact", completed: true })
  })
})

// Shopify's erasure that cannot finish (0106): the shopper is left in a column no placeholder fits (an endpoint's URL
// must start with `https://`, and theirs is where it starts). The request is kept failed with that column, never with
// the value, counted on `/api/health/deep`, and tried again on the hour until it is done or its 30 days have passed.
describe("a Shopify erasure that cannot finish", () => {
  const endpoint = (url: string) => ({
    url,
    description: "",
    events: ["order.cancelled"],
    apiVersion: "2026-10-01",
    stores: "all" as const,
    headers: [],
    retry: 3 as const,
    active: true
  })
  const deep = async () =>
    ((await (await call("http://api.test/api/health/deep")).json()) as {
      privacy: { redactsOpen: number; redactsFailed: number; redactsOverdue: number }
    }).privacy
  const shoppers = async (cookie: string) => ok(await rpc("Privacy.requests", undefined, cookie)).shoppers
  const retry = () => call("http://api.test/api/__dev/privacy/redacts", { method: "POST" })
  /** A store whose shopper (Shopify's customer 2) is also the start of a webhook endpoint's URL. */
  const stuck = async (tag: string) => {
    const own = await imported(tag)
    const site = `https://${tag}-${run}.example`.toLowerCase()
    const id = ok(await rpc("Webhooks.create", endpoint(`${site}/hook`), own.cookie)).endpoint.id
    const body = { shop_domain: own.shop, customer: { id: 2, email: site }, orders_to_redact: [3] }
    expect((await hook(own.shop, "customers/redact", body)).status).toBe(200)
    return { own, site, id, body, mirror: await settled(own) }
  }

  it("is kept failed with the column, counted, and done by the hourly retry once the column fits", async () => {
    const before = await deep()
    const { own, site, id, body, mirror } = await stuck("redact-kept")
    // Nothing of the erasure stayed: the shopper is still there, and the request is open.
    expect(mirror.customers[1]).not.toEqual({ name: "", email: null })
    expect(mirror.gdpr).toEqual([{ kind: "customer_redact", completed: false }])
    const [request] = await shoppers(own.cookie)
    expect(request).toMatchObject({
      kind: "erasure",
      source: "shopify",
      state: "failed",
      error: "webhook_endpoints.url",
      completedAt: null
    })
    expect(JSON.stringify(request)).not.toContain(site)
    expect((await deep()).redactsFailed).toBeGreaterThanOrEqual(before.redactsFailed + 1)

    // Shopify sends it again meanwhile: the same request, not a second one.
    expect((await hook(own.shop, "customers/redact", body)).status).toBe(200)
    expect((await settled(own)).gdpr).toEqual([{ kind: "customer_redact", completed: false }])

    // The endpoint moved elsewhere: the next retry erases the shopper and the request is done.
    ok(await rpc("Webhooks.update", { id, ...endpoint(`https://elsewhere-${run}.example/hook`) }, own.cookie))
    expect((await retry()).status).toBe(200)
    const done = await mirrorOf(own)
    expect(done.customers[1]).toEqual({ name: "", email: null })
    expect(done.gdpr).toEqual([{ kind: "customer_redact", completed: true }])
    expect((await shoppers(own.cookie))[0]).toMatchObject({ state: "done", error: null })
  })

  it("is not tried again past its 30 days, and is counted overdue", async () => {
    const { own, id } = await stuck("redact-late")
    const [request] = await shoppers(own.cookie)
    expect(request).toMatchObject({ state: "failed", error: "webhook_endpoints.url" })
    const aged = await call(
      `http://api.test/api/__dev/privacy/age?workspace=${own.workspace}&request=${request!.id}&days=31`,
      { method: "POST" }
    )
    expect(((await aged.json()) as { aged: number }).aged).toBe(1)
    ok(await rpc("Webhooks.update", { id, ...endpoint(`https://elsewhere-late-${run}.example/hook`) }, own.cookie))
    expect((await retry()).status).toBe(200)
    expect((await mirrorOf(own)).gdpr).toEqual([{ kind: "customer_redact", completed: false }])
    expect((await deep()).redactsOverdue).toBeGreaterThanOrEqual(1)
  })
})

describe("the reconcile sweep", () => {
  // The cron's own run (`storesToReconcile`, then `sweepStores`), narrowed to this store. The whole 15-minute tick
  // reads every store the shared test database holds, longest-waiting first, so a store just imported comes last, and
  // the pool lets go of a tick's work after 30 s.
  it("repairs what changed in Shopify without a webhook, in the 15-minute run", async () => {
    const store = await imported("sweep")
    expect((await mirrorOf(store)).orders.find((o) => o.number === "#1001")).toMatchObject({ status: "paid" })
    const answer = await call(
      `http://api.test/api/__dev/stores/reconcile?workspace=${store.workspace}&store=${store.storeId}`,
      { method: "POST" }
    )
    expect(await answer.json()).toEqual({ listed: true, swept: 1 })
    const mirror = await mirrorOf(store)
    expect(mirror.orders.find((o) => o.number === "#1001")).toMatchObject({ status: "shipped" })
    expect(mirror.orders.find((o) => o.number === "#1002")).toMatchObject({ status: "delivered" })
  })
})
