import { describe, expect, it } from "vitest"
import { failure, ok, person, run } from "./journeys.ts"
import { call, rpc } from "./support.ts"

/*
 * Connecting a Shopify store on the server (step 8.1, M6.2), against Shopify's recorded twin: the approval page's
 * address with a nonce; the callback that checks the signature, the nonce and the shop, and lands where the flow began;
 * a shop connected to another workspace refused, not moved; disconnecting and reconnecting with the same store.
 */

// A shop of this run's own: the shared database keeps earlier runs' stores connected.
const HANDLE = `mvp-${run}`
const SHOP = `${HANDLE}.myshopify.com`

/** Shopify's way back, as the browser follows it (the recorded twin trusts the signature `valid`). */
const back = async (cookie: string, query: Record<string, string>) => {
  const response = await call(`http://api.test/api/connect/shopify/callback?${new URLSearchParams(query)}`, {
    headers: { cookie },
    redirect: "manual"
  })
  expect(response.status).toBe(302)
  return new URL(response.headers.get("location")!, "http://console")
}

const begin = async (cookie: string, shopDomain: string, returnPath = "/onboarding") => {
  const { authorizeUrl } = ok(await rpc("Stores.beginConnect", { shopDomain, returnPath }, cookie))
  return new URL(authorizeUrl).searchParams.get("state")!
}

describe("connecting a Shopify store", () => {
  let owner = { email: "", cookie: "" }
  let storeId = ""

  it("answers Shopify's approval page for a shop that exists, and refuses one that does not", async () => {
    owner = await person("stores-owner", "Winkel B.V.")
    expect(ok(await rpc("Stores.list", undefined, owner.cookie))).toEqual([])
    const { authorizeUrl } = ok(
      await rpc("Stores.beginConnect", {
        shopDomain: ` https://${HANDLE.toUpperCase()}.myshopify.com/admin `,
        returnPath: "/onboarding"
      }, owner.cookie)
    )
    const url = new URL(authorizeUrl)
    expect(url.host).toBe(SHOP)
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:4300/api/connect/shopify/callback")
    expect(url.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/)
    expect(failure(await rpc("Stores.beginConnect", { shopDomain: "missing-shop", returnPath: "/" }, owner.cookie)))
      .toMatchObject({ _tag: "ShopNotFound", shopDomain: "missing-shop.myshopify.com" })
    expect(failure(await rpc("Stores.beginConnect", { shopDomain: "geen winkel!", returnPath: "/" }, owner.cookie)))
      .toMatchObject({ _tag: "ShopNotFound" })
  })

  it("connects the store on Shopify's way back, and lands where the flow began", async () => {
    const state = await begin(owner.cookie, HANDLE)
    const landed = await back(owner.cookie, { code: "abc", shop: SHOP, state, hmac: "valid", timestamp: "1" })
    expect(landed.pathname).toBe("/onboarding")
    expect(landed.searchParams.get("connected")).toBe("shopify")
    storeId = landed.searchParams.get("store")!
    const [store] = ok(await rpc("Stores.list", undefined, owner.cookie))
    expect(store).toMatchObject({
      id: storeId,
      name: "Insyte MVP Test",
      shopDomain: SHOP,
      status: "connected",
      currency: "EUR",
      country: "NL"
    })

    // The same way back again: its nonce is spent.
    expect((await back(owner.cookie, { code: "abc", shop: SHOP, state, hmac: "valid" })).searchParams.get("error"))
      .toBe("state")
  })

  it("trusts no callback it did not check: the signature, the shop, the code", async () => {
    const forged = await begin(owner.cookie, HANDLE)
    expect(
      (await back(owner.cookie, { code: "abc", shop: SHOP, state: forged, hmac: "forged" })).searchParams.get("error")
    )
      .toBe("signature")
    const swapped = await begin(owner.cookie, HANDLE)
    expect(
      (await back(owner.cookie, { code: "abc", shop: "other.myshopify.com", state: swapped, hmac: "valid" }))
        .searchParams
        .get("error")
    ).toBe("shop")
    const refused = await begin(owner.cookie, HANDLE)
    expect(
      (await back(owner.cookie, { code: "refused", shop: SHOP, state: refused, hmac: "valid" })).searchParams.get(
        "error"
      )
    )
      .toBe("exchange")
  })

  it("refuses the shop to another workspace instead of moving it", async () => {
    const other = await person("stores-other", "Ander B.V.")
    const state = await begin(other.cookie, SHOP, "/settings/stores")
    const landed = await back(other.cookie, { code: "abc", shop: SHOP, state, hmac: "valid" })
    expect(landed.searchParams.get("error")).toBe("elsewhere")
    expect(ok(await rpc("Stores.list", undefined, other.cookie))).toEqual([])
  })

  it("disconnects the store, and a reconnect keeps it", async () => {
    expect(ok(await rpc("Stores.disconnect", { id: storeId }, owner.cookie))[0]).toMatchObject({
      status: "disconnected"
    })
    expect(failure(await rpc("Stores.disconnect", { id: storeId }, owner.cookie))).toMatchObject({ _tag: "NotFound" })
    const state = await begin(owner.cookie, SHOP, "/settings/stores")
    const landed = await back(owner.cookie, { code: "again", shop: SHOP, state, hmac: "valid" })
    expect(landed.searchParams.get("store")).toBe(storeId)
    expect(ok(await rpc("Stores.list", undefined, owner.cookie))).toEqual([
      expect.objectContaining({ id: storeId, status: "connected" })
    ])
  })
})
