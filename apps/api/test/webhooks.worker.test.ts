import {
  createExecutionContext,
  createScheduledController,
  introspectWorkflow,
  waitOnExecutionContext
} from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import worker from "../src/Main.ts"
import { ok, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

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
const imported = async (tag: string) => {
  await using workflows = await introspectWorkflow(env.SHOPIFY_BACKFILL)
  await workflows.modifyAll(async (m) => {
    await m.disableSleeps()
  })
  const owner = await person(`hooks-${tag}`, `Hooks ${tag} B.V.`)
  const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
  const shop = `upd-${tag}-${run}.myshopify.com`
  const { authorizeUrl } = ok(await rpc("Stores.beginConnect", { shopDomain: shop, returnPath: "/" }, owner.cookie))
  const state = new URL(authorizeUrl).searchParams.get("state")!
  const landed = await call(
    `http://api.test/api/connect/shopify/callback?${new URLSearchParams({ code: "abc", shop, state, hmac: "valid" })}`,
    { headers: { cookie: owner.cookie }, redirect: "manual" }
  )
  const storeId = new URL(landed.headers.get("location")!, "http://console").searchParams.get("store")!
  await relay(workspace)
  const [instance] = await workflows.get()
  await instance!.waitForStatus("complete")
  return { ...owner, workspace, shop, storeId }
}

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
})

describe("the reconcile sweep", () => {
  it("repairs what changed in Shopify without a webhook, on the fifteenth minute", async () => {
    const store = await imported("sweep")
    expect((await mirrorOf(store)).orders.find((o) => o.number === "#1001")).toMatchObject({ status: "paid" })
    const ctx = createExecutionContext()
    await worker.scheduled(createScheduledController({ scheduledTime: Date.UTC(2026, 10, 8, 12, 15) }), env, ctx)
    await waitOnExecutionContext(ctx)
    const mirror = await mirrorOf(store)
    expect(mirror.orders.find((o) => o.number === "#1001")).toMatchObject({ status: "shipped" })
    expect(mirror.orders.find((o) => o.number === "#1002")).toMatchObject({ status: "delivered" })
  })
})
