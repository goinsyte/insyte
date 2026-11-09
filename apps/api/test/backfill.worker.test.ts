import { RECORDED_COUNTS } from "@insyte/integrations-shopify/RecordedBulk"
import { introspectWorkflow, introspectWorkflowInstance } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, person, relay, run } from "./journeys.ts"
import { call, onboarding, rpc, sessionMe } from "./support.ts"

/*
 * A store's first import (step 8.2, M6.3), against Shopify's recorded twin read four lines a page: connecting starts
 * the backfill Workflow through the relay; it mirrors what the store holds, with the same counts as Shopify reports,
 * and the store is connected and synced. Run again, it changes nothing; a page that fails is retried and resumes
 * without duplicates. The gate refreshes a lapsing token once, however many ask at the same time.
 */

const back = async (cookie: string, query: Record<string, string>) => {
  const response = await call(`http://api.test/api/connect/shopify/callback?${new URLSearchParams(query)}`, {
    headers: { cookie },
    redirect: "manual"
  })
  return new URL(response.headers.get("location")!, "http://console")
}

/** A connected store of this run's own, in a new workspace; the code decides the token the twin issues. */
const connected = async (tag: string, code = "abc") => {
  const owner = await person(`backfill-${tag}`, `Backfill ${tag} B.V.`)
  const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
  const shop = `bf-${tag}-${run}.myshopify.com`
  const { authorizeUrl } = ok(await rpc("Stores.beginConnect", { shopDomain: shop, returnPath: "/" }, owner.cookie))
  const state = new URL(authorizeUrl).searchParams.get("state")!
  const landed = await back(owner.cookie, { code, shop, state, hmac: "valid", timestamp: "1" })
  return { ...owner, workspace, storeId: landed.searchParams.get("store")! }
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
  let owner = { cookie: "", workspace: "", storeId: "" }

  it("starts on connect, and mirrors the store with Shopify's counts", async () => {
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
    // The first analysis (M6.5) follows the import; the offline plan waits for M15.
    expect(ok(await onboarding.advance({ step: "analysis" }, founder.cookie))).toMatchObject({ step: "ready" })
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
