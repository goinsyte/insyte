import { ConnectionHealth, Incident } from "@insyte/modules/stores/domain/Health"
import { describe, expect, it } from "vitest"
import { storeHealthOf } from "../src/stores/health-of.ts"

/*
 * A store's sync health as Winkels shows it: one word on the row, the last sync beside it, and each incident with who
 * heard of it and, once it is over, what was wrong in the past tense.
 */

const NOW = Date.UTC(2026, 10, 20, 15, 30)
const HOUR = 3_600_000

const incident = (over: Partial<ConstructorParameters<typeof Incident>[0]> = {}) =>
  new Incident({
    id: "inc_1",
    kind: "sync_failed",
    openedAt: NOW - 2 * HOUR,
    resolvedAt: null,
    facts: {},
    tried: [],
    notified: "Sanne",
    notifiedYou: false,
    ...over
  })

const connection = (over: Partial<ConstructorParameters<typeof ConnectionHealth>[0]> = {}) =>
  new ConnectionHealth({
    connectionId: "con_1",
    provider: "shopify",
    storeId: "sto_1",
    storeName: "Noorderlicht",
    shopDomain: "noorderlicht.myshopify.com",
    state: "ok",
    lastSyncedAt: NOW - HOUR,
    lastDeliveryAt: null,
    incidents: [],
    ...over
  })

describe("a store's sync health on Winkels", () => {
  it("says a store that is fine once, as connected, with its last sync beside it", () => {
    const health = storeHealthOf(connection(), NOW)
    expect(health.label).toBe("Gekoppeld")
    expect(health.synced).toBe("Gesynchroniseerd om 15:30")
    expect(health.synced).not.toContain(health.label)
  })

  it("says who heard of an incident, and 'jou' when that is the reader", () => {
    const told = (notifiedYou: boolean) =>
      storeHealthOf(connection({ state: "broken", incidents: [incident({ notifiedYou })] }), NOW).incidents[0]!.told
    expect(told(false)).toBe("Gemeld aan Sanne")
    expect(told(true)).toBe("Gemeld aan jou")
  })

  it("says a resolved incident in the past tense, an open one in the present", () => {
    const of = (resolvedAt: number | null) =>
      storeHealthOf(connection({ incidents: [incident({ resolvedAt })] }), NOW).incidents[0]!.finding
    expect(of(null)).toBe("Synchroniseren met Shopify lukt niet.")
    expect(of(NOW - HOUR)).toBe("Synchroniseren met Shopify lukte niet.")
  })
})
