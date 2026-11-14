import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { ok, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * A workspace with a connected, imported store of its own (steps 8.2–8.4), against the recorded twin: the owner
 * connects `<prefix>-<tag>-<run>.myshopify.com`, the relay starts the backfill, and it runs to the end with its
 * sleeps off. An `upd-*` shop's Shopify changed since the import (`RECORDED_UPDATES`).
 */
export const importedStore = async (tag: string, prefix = "shop") => {
  const owner = await person(`${prefix}-${tag}`, `${prefix} ${tag} B.V.`)
  const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
  return { ...owner, workspace, ...await connected(owner.cookie, workspace, `${prefix}-${tag}-${run}.myshopify.com`) }
}

/** Another store of the same workspace, connected and imported as the first was: a brand with more than one shop. */
export const anotherStore = (store: { cookie: string; workspace: string }, tag: string) =>
  connected(store.cookie, store.workspace, `shop-${tag}-${run}.myshopify.com`)

const connected = async (cookie: string, workspace: string, shop: string) => {
  await using workflows = await introspectWorkflow(env.SHOPIFY_BACKFILL)
  await workflows.modifyAll(async (m) => {
    await m.disableSleeps()
  })
  const { authorizeUrl } = ok(await rpc("Stores.beginConnect", { shopDomain: shop, returnPath: "/" }, cookie))
  const state = new URL(authorizeUrl).searchParams.get("state")!
  const landed = await call(
    `http://api.test/api/connect/shopify/callback?${new URLSearchParams({ code: "abc", shop, state, hmac: "valid" })}`,
    { headers: { cookie }, redirect: "manual" }
  )
  const storeId = new URL(landed.headers.get("location")!, "http://console").searchParams.get("store")!
  await relay(workspace)
  const [instance] = await workflows.get()
  await instance!.waitForStatus("complete")
  return { shop, storeId }
}
