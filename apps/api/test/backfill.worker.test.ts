import { RECORDED_COUNTS } from "@insyte/integrations-shopify/RecordedStore"
import { recordedPageReads } from "@insyte/integrations-shopify/ShopifyRecorded"
import { introspectWorkflow, introspectWorkflowInstance } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, person, relay, run } from "./journeys.ts"
import { call, onboarding, rpc, sessionMe } from "./support.ts"

/*
 * A store's first import (step 8.2, M6.3), against Shopify's recorded twin read two objects a page, a child at a time
 * and two pages a step: connecting starts the backfill Workflow through the relay; it reads every page, across steps,
 * and every child past a node's first (the shirt's second variant and photographs, an order's second line); it
 * mirrors what the store holds, with the same counts as Shopify reports, and the store is connected and synced. Run
 * again, it changes nothing; a step that fails is retried and resumes from its last page without duplicates; a
 * throttle is waited out, in the step or by the Workflow. The gate refreshes a lapsing token once, however many ask at
 * the same time.
 */

const back = async (cookie: string, query: Record<string, string>) => {
  const response = await call(`http://api.test/api/connect/shopify/callback?${new URLSearchParams(query)}`, {
    headers: { cookie },
    redirect: "manual"
  })
  return new URL(response.headers.get("location")!, "http://console")
}

/**
 * A connected store of this run's own, in a new workspace; the code decides the token the twin issues, the shop's
 * prefix how the twin behaves (`throttle-`, `flaky-`).
 */
const connected = async (tag: string, code = "abc", prefix = "bf") => {
  const owner = await person(`backfill-${tag}`, `Backfill ${tag} B.V.`)
  const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
  const shop = `${prefix}-${tag}-${run}.myshopify.com`
  const { authorizeUrl } = ok(await rpc("Stores.beginConnect", { shopDomain: shop, returnPath: "/" }, owner.cookie))
  const state = new URL(authorizeUrl).searchParams.get("state")!
  const landed = await back(owner.cookie, { code, shop, state, hmac: "valid", timestamp: "1" })
  return { ...owner, workspace, shop, storeId: landed.searchParams.get("store")! }
}

/** A store connected and imported to the end, its sleeps and retry delays off. */
const imported = async (tag: string, prefix: string) => {
  await using workflows = await introspectWorkflow(env.SHOPIFY_BACKFILL)
  await workflows.modifyAll(async (m) => {
    await m.disableSleeps()
    await m.disableRetryDelays()
  })
  const store = await connected(tag, "abc", prefix)
  await relay(store.workspace)
  const [instance] = await workflows.get()
  await instance!.waitForStatus("complete")
  return store
}

/**
 * Every page the import reads of the recorded store, two objects a page, in order: three products, four inventory
 * items, three customers, five orders. Two pages a step, so the orders' third page is a step of its own.
 */
const PAGES = {
  products: ["products:start", "products:2"],
  stock: ["inventoryItems:start", "inventoryItems:2"],
  customers: ["customers:start", "customers:2"],
  orders: ["orders:start", "orders:2", "orders:4"]
}

const connectionOf = async (workspace: string, store: string) =>
  ((await (await call(`http://api.test/api/__dev/stores/connection?workspace=${workspace}&store=${store}`)).json()) as {
    connectionId: string
  }).connectionId

const EXPECTED = {
  products: RECORDED_COUNTS.products,
  customers: RECORDED_COUNTS.customers,
  orders: RECORDED_COUNTS.orders
}

describe("a store's first import", () => {
  let owner = { cookie: "", workspace: "", shop: "", storeId: "" }

  it("starts on connect, reads every page across its steps, and mirrors the store with Shopify's counts", async () => {
    await using workflows = await introspectWorkflow(env.SHOPIFY_BACKFILL)
    await workflows.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    owner = await connected("first")
    // The relay delivers `store.connected`; its backfill sink starts the Workflow.
    await relay(owner.workspace)
    const [instance] = await workflows.get()
    expect(instance).toBeDefined()
    await instance!.waitForStatus("complete")

    const status = ok(await rpc("Stores.syncStatus", { id: owner.storeId }, owner.cookie))
    expect(status.counts).toEqual(EXPECTED)
    expect(status.status).toBe("connected")
    expect(status.lastSyncedAt).not.toBeNull()
    expect(status.resources.map((r) => [r.resource, r.phase])).toEqual([
      ["products", "done"],
      ["customers", "done"],
      ["orders", "done"]
    ])
    expect(ok(await rpc("Stores.list", undefined, owner.cookie))[0]).toMatchObject({ status: "connected" })
    // Each page once, in order: the orders' last page was a step of its own, from the cursor the one before kept.
    expect(recordedPageReads(owner.shop)).toEqual([
      ...PAGES.products,
      ...PAGES.stock,
      ...PAGES.customers,
      ...PAGES.orders
    ])
  })

  it("reads a node's children past their first page, so every product and order is whole", async () => {
    // A child at a time: the shirt's L, its two other photographs, and order #1005's second line each came after.
    const linen = ok(await rpc("Products.list", { limit: 50 }, owner.cookie)).rows.find((p) =>
      p.title === "Linnen overhemd"
    )!
    const detail = ok(await rpc("Products.get", { id: linen.id }, owner.cookie))
    expect(detail.variants.map((v) => v.title)).toEqual(["M", "L"])
    expect(detail.images).toHaveLength(3)
    const order = ok(await rpc("Orders.list", { limit: 50 }, owner.cookie)).rows.find((o) => o.number === "#1005")!
    expect(ok(await rpc("Orders.get", { id: order.id }, owner.cookie)).lines).toHaveLength(2)
  })

  it("resumes a step that failed from the last page it wrote, not from the start", async () => {
    // A gateway error on the second page of orders, in the step that had written the first.
    const store = await imported("flaky", "flaky")
    expect(ok(await rpc("Stores.syncStatus", { id: store.storeId }, store.cookie)).counts).toEqual(EXPECTED)
    expect(recordedPageReads(store.shop).filter((r) => r.startsWith("orders:"))).toEqual([
      "orders:start",
      "orders:2",
      // The step again: from its checkpoint, the first page not read twice.
      "orders:2",
      "orders:4"
    ])
  })

  it("waits out Shopify's throttle, in the step or asleep, and reads on", async () => {
    // The first page asked waits a minute (the Workflow sleeps on it), the second a moment (the step waits).
    const store = await imported("throttle", "throttle")
    expect(ok(await rpc("Stores.syncStatus", { id: store.storeId }, store.cookie))).toMatchObject({
      status: "connected",
      counts: EXPECTED
    })
    expect(recordedPageReads(store.shop)).toEqual([
      "products:start",
      "products:start",
      ...PAGES.products,
      ...PAGES.stock,
      ...PAGES.customers,
      ...PAGES.orders
    ])
  })

  it("changes nothing when it runs again", async () => {
    const id = `again-${run}`
    await using instance = await introspectWorkflowInstance(env.SHOPIFY_BACKFILL, id)
    await instance.modify(async (m) => {
      await m.disableSleeps()
    })
    await env.SHOPIFY_BACKFILL.create({ id, params: { workspaceId: owner.workspace, storeId: owner.storeId } })
    await instance.waitForStatus("complete")
    expect(ok(await rpc("Stores.syncStatus", { id: owner.storeId }, owner.cookie)).counts).toEqual(EXPECTED)
  })

  it("retries a page that failed, and resumes without duplicates", async () => {
    const id = `resume-${run}`
    await using instance = await introspectWorkflowInstance(env.SHOPIFY_BACKFILL, id)
    await instance.modify(async (m) => {
      await m.disableSleeps()
      await m.disableRetryDelays()
      // The second page of orders fails once, after the first page was written.
      await m.mockStepError({ name: "page orders 1" }, new Error("Shopify went away"), 1)
    })
    await env.SHOPIFY_BACKFILL.create({ id, params: { workspaceId: owner.workspace, storeId: owner.storeId } })
    await instance.waitForStatus("complete")
    expect(ok(await rpc("Stores.syncStatus", { id: owner.storeId }, owner.cookie)).counts).toEqual(EXPECTED)
  })

  it("takes onboarding from the store step through sync and the analysis to ready, each fact checked on the server", async () => {
    await using workflows = await introspectWorkflow(env.SHOPIFY_BACKFILL)
    await workflows.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    const founder = await person(`backfill-onboarding`, "Onboarding B.V.")
    ok(await onboarding.advance({ step: "plan", plan: "growth", cycle: "monthly" }, founder.cookie))
    // No store yet: "connected" is not taken on the console's word.
    expect(failure(await onboarding.advance({ step: "store", choice: "connected" }, founder.cookie))).toMatchObject({
      _tag: "StepNotReady",
      missing: "store"
    })
    const workspace = ok(await sessionMe(founder.cookie)).principals[0]!.workspaceId
    const shop = `bf-onboarding-${run}.myshopify.com`
    const { authorizeUrl } = ok(
      await rpc("Stores.beginConnect", { shopDomain: shop, returnPath: "/onboarding" }, founder.cookie)
    )
    const state = new URL(authorizeUrl).searchParams.get("state")!
    const landed = await back(founder.cookie, { code: "abc", shop, state, hmac: "valid", timestamp: "1" })
    expect(landed.pathname).toBe("/onboarding")
    expect(ok(await onboarding.advance({ step: "store", choice: "connected" }, founder.cookie))).toMatchObject({
      step: "sync",
      answers: { store: "connected" }
    })
    // The import is not in yet.
    expect(failure(await onboarding.advance({ step: "sync" }, founder.cookie))).toMatchObject({
      _tag: "StepNotReady",
      missing: "import"
    })
    await relay(workspace)
    const [instance] = await workflows.get()
    await instance!.waitForStatus("complete")
    expect(ok(await onboarding.advance({ step: "sync" }, founder.cookie))).toMatchObject({ step: "analysis" })
    // The first analysis (M6.5) follows the import, then the offline plan (M15), which may be left as it is.
    expect(ok(await onboarding.advance({ step: "analysis" }, founder.cookie))).toMatchObject({ step: "offline" })
    expect(ok(await onboarding.advance({ step: "offline" }, founder.cookie))).toMatchObject({ step: "ready" })
    expect(ok(await onboarding.start(founder.cookie)).done).toContain("store")
  })

  it("refreshes a lapsing token once, however many ask", async () => {
    const store = await connected("refresh", "short")
    const connectionId = await connectionOf(store.workspace, store.storeId)
    const gate = env.CONNECTION_GATE.getByName(connectionId)
    const answers = await Promise.all(
      Array.from({ length: 20 }, () => gate.accessToken(store.workspace, connectionId))
    )
    const tokens = new Set(answers.map((a) => a.token))
    expect(tokens.size).toBe(1)
    expect([...tokens][0]).toMatch(/^recorded-access-r\d+$/)
    // Held now: asking again neither refreshes nor reads.
    expect((await gate.accessToken(store.workspace, connectionId)).token).toBe([...tokens][0])
  })

  it("a disconnected store's gate lets go of its token", async () => {
    const store = await connected("disconnect")
    const connectionId = await connectionOf(store.workspace, store.storeId)
    const gate = env.CONNECTION_GATE.getByName(connectionId)
    expect((await gate.accessToken(store.workspace, connectionId)).token).toBe("recorded-access-abc")
    ok(await rpc("Stores.disconnect", { id: store.storeId }, store.cookie))
    expect(await gate.accessToken(store.workspace, connectionId)).toMatchObject({
      token: null,
      refused: "disconnected"
    })
  })
})
