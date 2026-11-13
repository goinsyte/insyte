import { recordedPixelSettings } from "@insyte/integrations-shopify/ShopifyRecorded"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, ok, person, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Live (M14 step 3): a store's Web Pixel installed from Winkels, its events through `POST /api/public/pixel/:storeId`
 * on the public host into the workspace's live room, and `/live`'s snapshot and frames. The ingest refuses a bad key
 * and a foreign origin, keeps nothing that names the visitor, and the frames reach only the tabs that asked.
 */

const PUBLIC = "https://api.public.test"

const settingsOf = (shop: string) =>
  JSON.parse(recordedPixelSettings.get(shop)!) as { storeId: string; ingestKey: string; endpoint: string }

const event = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  type: "page_viewed",
  clientId: "shopify-client-id-1234",
  page: "Regenjassen – Winkel",
  source: { utmSource: "facebook", utmMedium: "paid_social" },
  device: "mobiel",
  returning: false,
  ...over
})

const post = (
  storeId: string,
  body: unknown,
  init: { origin?: string; cf?: Record<string, unknown>; ip?: string } = {}
) =>
  call(`${PUBLIC}/api/public/pixel/${storeId}`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      ...(init.origin === undefined ? {} : { origin: init.origin }),
      ...(init.ip === undefined ? {} : { "cf-connecting-ip": init.ip })
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...(init.cf === undefined ? {} : { cf: init.cf })
  } as RequestInit)

const open = async (cookie: string, tab: string) => {
  const response = await call(`http://api.test/api/realtime?tab=${tab}`, { headers: { upgrade: "websocket", cookie } })
  expect(response.status).toBe(101)
  const socket = response.webSocket!
  const frames: Array<{ type: string; [field: string]: unknown }> = []
  socket.addEventListener("message", (e) => frames.push(JSON.parse(String(e.data))))
  socket.accept()
  return { socket, frames }
}

const until = async (check: () => boolean, what: string) => {
  for (let i = 0; i < 60; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`waited for ${what}`)
}

describe("live", () => {
  it("says there is no store, then no pixel, and installs one through Shopify", async () => {
    const alone = await person("live-alone", "Leeg B.V.")
    expect(ok(await rpc("Live.snapshot", undefined, alone.cookie)).pixel).toBe("no_store")

    const shop = await importedStore("pixel", "live")
    const before = ok(await rpc("Live.snapshot", undefined, shop.cookie))
    expect(before.pixel).toBe("not_installed")
    expect(before.stores).toEqual([])
    expect(ok(await rpc("Live.pixels", undefined, shop.cookie)).pixels).toEqual([
      { storeId: shop.storeId, state: "none", installedAt: null, lastEventAt: null }
    ])

    const installed = ok(await rpc("Live.installPixel", { storeId: shop.storeId }, shop.cookie))
    expect(installed.available).toBe(true)
    expect(installed.pixels[0]).toMatchObject({ storeId: shop.storeId, state: "installed" })
    const settings = settingsOf(shop.shop)
    expect(settings.storeId).toBe(shop.storeId)
    expect(settings.endpoint).toBe(`${PUBLIC}/api/public/pixel/${shop.storeId}`)
    expect(settings.ingestKey.length).toBeGreaterThanOrEqual(32)

    const after = ok(await rpc("Live.snapshot", undefined, shop.cookie))
    expect(after.pixel).toBe("installed")
    expect(after.stores).toEqual([{ id: shop.storeId, name: expect.any(String) }])
  })

  it("says why Shopify would not install it", async () => {
    const noScope = await importedStore("scope", "noscope")
    const refused = failure(await rpc("Live.installPixel", { storeId: noScope.storeId }, noScope.cookie))
    expect(refused).toMatchObject({ _tag: "PixelInstallFailed", reason: "scope" })
    expect(ok(await rpc("Live.pixels", undefined, noScope.cookie)).pixels[0]!.state).toBe("none")

    const gone = failure(await rpc("Live.installPixel", { storeId: "store_none" }, noScope.cookie))
    expect(gone).toMatchObject({ _tag: "NotFound" })
  })

  it("takes the pixel's events into the room, refuses a bad key or origin, and keeps nothing personal", async () => {
    const shop = await importedStore("ingest", "live")
    ok(await rpc("Live.installPixel", { storeId: shop.storeId }, shop.cookie))
    const { ingestKey } = settingsOf(shop.shop)
    const storefront = `https://www.live-ingest-${shop.shop.split("-").at(-1)!.replace(".myshopify.com", "")}.test`

    // An id that is no store's, an unknown store, a bad key, a body that is no event, an origin that is not the store's.
    expect((await post("store_none", event(ingestKey))).status).toBe(404)
    expect((await post("sto_00000000000000000000000000", event(ingestKey))).status).toBe(404)
    expect((await post(shop.storeId, event("x".repeat(40)))).status).toBe(403)
    expect((await post(shop.storeId, "{not json")).status).toBe(400)
    expect((await post(shop.storeId, { ...event(ingestKey), type: "purchase" })).status).toBe(400)
    expect((await post(shop.storeId, event(ingestKey), { origin: "https://elders.test" })).status).toBe(403)

    // The store's own storefront, and the opaque origin of Shopify's sandbox.
    const viewed = await post(shop.storeId, event(ingestKey), {
      origin: storefront,
      cf: { city: "Utrecht", country: "NL", latitude: "52.09", longitude: "5.12" }
    })
    expect(viewed.status).toBe(204)
    expect(viewed.headers.get("access-control-allow-origin")).toBe(storefront)
    const carted = await post(shop.storeId, event(ingestKey, { type: "product_added_to_cart", page: "Regenjas" }), {
      origin: "null"
    })
    expect(carted.status).toBe(204)

    const snapshot = ok(await rpc("Live.snapshot", undefined, shop.cookie))
    expect(snapshot.visitors).toHaveLength(1)
    const [visitor] = snapshot.visitors
    expect(visitor).toMatchObject({
      storeId: shop.storeId,
      city: "Utrecht",
      country: "NL",
      source: "Meta ads",
      device: "mobiel",
      stage: "cart",
      page: "Regenjas"
    })
    expect(snapshot.events.map((e) => e.kind)).toEqual(["cart", "arrive"])
    expect(snapshot.events[1]!.visitor.page).toBe("Regenjassen")
    // Shopify's client id never leaves the ingest: the visitor is a keyed hash of it.
    expect(JSON.stringify(snapshot)).not.toContain("shopify-client-id-1234")
    expect(visitor!.id).toMatch(/^[0-9a-f]{20}$/)
    // The one thing the pixel writes: that the store's Live view works.
    expect(ok(await rpc("Live.pixels", undefined, shop.cookie)).pixels[0]!.lastEventAt).not.toBeNull()

    // A repair makes a new key, and the old one stops working.
    ok(await rpc("Live.installPixel", { storeId: shop.storeId }, shop.cookie))
    const renewed = settingsOf(shop.shop).ingestKey
    expect(renewed).not.toBe(ingestKey)
    expect((await post(shop.storeId, event(ingestKey))).status).toBe(403)
    expect((await post(shop.storeId, event(renewed))).status).toBe(204)
  })

  it("counts a flood without the key against its IP, never against the store, so real events still arrive", async () => {
    const shop = await importedStore("flood", "live")
    ok(await rpc("Live.installPixel", { storeId: shop.storeId }, shop.cookie))
    const { ingestKey } = settingsOf(shop.shop)
    const octet = Number.parseInt(run.slice(-2), 36) % 250
    const attacker = `192.0.2.${octet}`
    // 120 a minute from one address, whatever they send; then 429, before the body or the store is looked at.
    for (let i = 0; i < 120; i++) {
      expect((await post(shop.storeId, event("y".repeat(40)), { ip: attacker })).status).toBe(403)
    }
    expect((await post(shop.storeId, event("y".repeat(40)), { ip: attacker })).status).toBe(429)
    // An IPv6 host is one address per /64: rotating the rest of the address does not help.
    for (let i = 0; i < 120; i++) {
      const ip = `2001:db8:${octet.toString(16)}:1::${i.toString(16)}`
      expect((await post(shop.storeId, "{}", { ip })).status).toBe(400)
    }
    expect((await post(shop.storeId, "{}", { ip: `2001:db8:${octet.toString(16)}:1:ffff::1` })).status).toBe(429)

    // None of that touched the store's budget: only an event with the key counts there.
    const storeBucket = () => env.RATE_LIMITER.getByName(`pixel:${shop.storeId}`).peek("pixel-store", 60)
    expect(await storeBucket()).toBe(0)
    expect((await post(shop.storeId, event(ingestKey), { ip: `198.51.100.${octet}` })).status).toBe(204)
    expect(await storeBucket()).toBe(1)
  })

  it("cuts off a body past 4 KB as it streams, with no length said", async () => {
    const shop = await importedStore("stream", "live")
    ok(await rpc("Live.installPixel", { storeId: shop.storeId }, shop.cookie))
    const chunk = new TextEncoder().encode("x".repeat(1024))
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 64) controller.enqueue(chunk)
        else controller.close()
      }
    })
    const response = await call(`${PUBLIC}/api/public/pixel/${shop.storeId}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body
    })
    expect(response.status).toBe(413)
    // It stopped reading soon after the cap, not at the end of the 64 KB.
    expect(sent).toBeLessThan(64)
  })

  it("finds the shop's own pixel when Shopify says it is taken, and keeps Shopify's key and its own in step", async () => {
    const taken = await importedStore("taken", "pixeltaken")
    const installed = ok(await rpc("Live.installPixel", { storeId: taken.storeId }, taken.cookie))
    expect(installed.pixels[0]).toMatchObject({ storeId: taken.storeId, state: "installed" })
    expect((await post(taken.storeId, event(settingsOf(taken.shop).ingestKey))).status).toBe(204)

    // Two installs at once: one at a time holds the store, and whichever key Shopify ends with is the one that works.
    const shop = await importedStore("twice", "live")
    const both = await Promise.all([
      rpc("Live.installPixel", { storeId: shop.storeId }, shop.cookie),
      rpc("Live.installPixel", { storeId: shop.storeId }, shop.cookie)
    ])
    const refused = both.filter((exit) => exit._tag === "Failure").map((exit) => failure(exit))
    expect(both.length - refused.length).toBeGreaterThanOrEqual(1)
    for (const r of refused) expect(r).toMatchObject({ _tag: "PixelInstallFailed", reason: "busy" })
    expect((await post(shop.storeId, event(settingsOf(shop.shop).ingestKey))).status).toBe(204)
  })

  it("sends live.visitors to the tabs that subscribed, and stops when they let go", async () => {
    const shop = await importedStore("frames", "live")
    ok(await rpc("Live.installPixel", { storeId: shop.storeId }, shop.cookie))
    const { ingestKey } = settingsOf(shop.shop)
    const watching = await open(shop.cookie, "tab-watching-1")
    const elsewhere = await open(shop.cookie, "tab-elsewhere-1")
    await until(() => watching.frames.some((f) => f.type === "hello"), "hello")
    expect(ok(await rpc("Live.subscribe", { tab: "tab-watching-1" }, shop.cookie)).leaseSeconds).toBe(60)

    expect((await post(shop.storeId, event(ingestKey, { clientId: "client-frames-1" }))).status).toBe(204)
    await until(() => watching.frames.some((f) => f.type === "live.visitors"), "live.visitors")
    const frame = watching.frames.find((f) => f.type === "live.visitors")!
    expect(frame).toMatchObject({ v: 1, upserts: [{ storeId: shop.storeId, stage: "browsing" }], removed: [] })
    expect((frame["events"] as Array<{ kind: string }>).map((e) => e.kind)).toEqual(["arrive"])
    expect(elsewhere.frames.some((f) => f.type === "live.visitors")).toBe(false)

    ok(await rpc("Live.unsubscribe", { tab: "tab-watching-1" }, shop.cookie))
    const lives = () => watching.frames.filter((f) => f.type === "live.visitors").length
    const heard = lives()
    expect((await post(shop.storeId, event(ingestKey, { clientId: "client-frames-2" }))).status).toBe(204)
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(lives()).toBe(heard)

    for (const t of [watching, elsewhere]) t.socket.close(1000, "done")
  })
})
