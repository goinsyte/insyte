import { describe, expect, it } from "vitest"
import type { PixelHit } from "../src/live/domain/Live.ts"
import {
  apply,
  BOUGHT_SHOWN_MS,
  emptyRoom,
  MAX_SESSIONS,
  MAX_SESSIONS_PER_STORE,
  pageOf,
  SESSION_TTL_MS,
  sourceOf,
  sweep,
  VISITORS_SHOWN,
  visitorsOf
} from "../src/live/domain/Sessions.ts"

/* The live room's rules (M14 step 3): the funnel a pixel event moves a visitor through, the feed, and leaving. */

const hit = (over: Partial<PixelHit> = {}): PixelHit => ({
  storeId: "store_1",
  visitorId: "v1",
  type: "page_viewed",
  city: "Utrecht",
  country: "NL",
  lon: 5.1,
  lat: 52.1,
  source: "Google",
  device: "mobiel",
  page: "Homepagina",
  returning: false,
  at: 1_000,
  ...over
})

describe("the live room", () => {
  it("says a visitor arrived once, then moves them forward through the cart and the checkout", () => {
    const room = emptyRoom()
    expect(apply(room, hit())?.event?.kind).toBe("arrive")
    expect(apply(room, hit({ type: "product_viewed", page: "Regenjas", at: 2_000 }))?.event).toBeUndefined()
    const carted = apply(room, hit({ type: "product_added_to_cart", page: "Regenjas", at: 3_000 }))!
    expect(carted.visitor).toMatchObject({ stage: "cart", movedAt: 3_000, arrivedAt: 1_000, page: "Regenjas" })
    expect(carted.event?.kind).toBe("cart")
    const checkout = apply(room, hit({ type: "checkout_started", page: "Afrekenen", at: 4_000 }))!
    expect(checkout.visitor).toMatchObject({ stage: "checkout", page: "Regenjas" })
    // Another product in the cart keeps them at the checkout; the sale is said by its order, not here.
    expect(apply(room, hit({ type: "product_added_to_cart", at: 4_500 }))!.visitor.stage).toBe("checkout")
    expect(apply(room, hit({ type: "checkout_completed", at: 5_000 }))?.event).toBeUndefined()
    expect(room.events.map((e) => e.kind)).toEqual(["checkout", "cart", "arrive"])
    expect(room.sessions.get("v1")!.stage).toBe("bought")
  })

  it("keeps the first source, and where they were when a request cannot be placed", () => {
    const room = emptyRoom()
    apply(room, hit({ source: "Meta ads" }))
    const later = apply(room, hit({ source: "Direct", country: "XX", city: "", lon: 0, lat: 0, at: 2_000 }))!
    expect(later.visitor).toMatchObject({ source: "Meta ads", country: "NL", city: "Utrecht" })
  })

  it("lets a silent visitor go after 30 minutes, and a buyer after 15 seconds", () => {
    const room = emptyRoom()
    apply(room, hit({ visitorId: "quiet" }))
    apply(room, hit({ visitorId: "buyer", type: "checkout_completed" }))
    expect(sweep(room, 1_000 + BOUGHT_SHOWN_MS)).toEqual(["buyer"])
    expect(sweep(room, 1_000 + SESSION_TTL_MS - 1)).toEqual([])
    expect(sweep(room, 1_000 + SESSION_TTL_MS)).toEqual(["quiet"])
  })

  it("takes no new visitor past a store's cap or the room's, and still moves those already there", () => {
    const room = emptyRoom()
    for (let i = 0; i < MAX_SESSIONS_PER_STORE; i++) apply(room, hit({ visitorId: `a${i}`, storeId: "store_a" }))
    expect(apply(room, hit({ visitorId: "one-too-many", storeId: "store_a" }))).toBeUndefined()
    expect(apply(room, hit({ visitorId: "a0", storeId: "store_a", type: "product_added_to_cart" }))!.visitor.stage)
      .toBe("cart")
    // Another store still has room, until the room itself is full.
    expect(apply(room, hit({ visitorId: "b0", storeId: "store_b" }))).toBeDefined()
    let store = 0
    while (room.sessions.size < MAX_SESSIONS) {
      const id = `s${store}`
      for (let i = 0; i < MAX_SESSIONS_PER_STORE && room.sessions.size < MAX_SESSIONS; i++) {
        apply(room, hit({ visitorId: `${id}-${i}`, storeId: id }))
      }
      store++
    }
    expect(apply(room, hit({ visitorId: "fresh", storeId: "store_new" }))).toBeUndefined()
    // A visitor who leaves frees their store's place.
    expect(sweep(room, 1_000 + SESSION_TTL_MS).length).toBe(MAX_SESSIONS)
    expect(room.perStore.size).toBe(0)
    expect(apply(room, hit({ visitorId: "after", storeId: "store_a", at: 1_000 + SESSION_TTL_MS }))).toBeDefined()
  })

  it("shows at most VISITORS_SHOWN, the most recently active first", () => {
    const room = emptyRoom()
    for (let i = 0; i < VISITORS_SHOWN + 5; i++) apply(room, hit({ visitorId: `v${i}`, storeId: `s${i % 3}`, at: i }))
    const shown = visitorsOf(room)
    expect(shown).toHaveLength(VISITORS_SHOWN)
    expect(shown[0]!.id).toBe(`v${VISITORS_SHOWN + 4}`)
  })

  it("names the source and the page as the design does", () => {
    expect(sourceOf({ clickId: "fb" }, [])).toBe("Meta ads")
    expect(sourceOf({ utmSource: "facebook", utmMedium: "paid_social" }, [])).toBe("Meta ads")
    expect(sourceOf({ utmSource: "klaviyo", utmMedium: "email" }, [])).toBe("Klaviyo")
    expect(sourceOf({ referrer: "l.instagram.com" }, [])).toBe("Instagram")
    expect(sourceOf({ clickId: "g" }, [])).toBe("Google")
    expect(sourceOf({ referrer: "www.google.nl" }, [])).toBe("Google")
    expect(sourceOf({ referrer: "www.winkel.nl" }, ["winkel.nl"])).toBe("Direct")
    expect(sourceOf({ referrer: "forum.test" }, [])).toBe("forum.test")
    expect(sourceOf({}, [])).toBe("Direct")
    expect(pageOf("Regenjassen – Northwind", "page_viewed")).toBe("Regenjassen")
    expect(pageOf("", "page_viewed")).toBe("Homepagina")
    expect(pageOf("Kassa", "checkout_started")).toBe("Afrekenen")
  })
})
