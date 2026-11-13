import { describe, expect, it } from "vitest"
import {
  assess,
  findingSentence,
  missingScopes,
  needsWrite,
  type Observed,
  type OpenIncident,
  stateOf,
  type Sweep,
  triedSummary
} from "../src/stores/domain/Health.ts"

/*
 * Sync health's decision (M17 step 6), pure: what holds for a connection given what the tables say and what the sweep
 * saw, and whether the check has anything to write for it, which decides whether its workspace opens a transaction.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 10, 13, 2, 0)

const healthy: Observed = {
  connectionStatus: "connected",
  storeStatus: "connected",
  scopes: ["read_orders", "read_products", "read_customers"],
  refreshExpiresAt: NOW + 90 * DAY,
  lastOrderDeliveryAt: NOW - 10 * 60_000,
  ordersWatermarkAt: NOW - 5 * 60_000,
  importedAt: NOW - 3 * DAY,
  failures: 0
}
const fine: Sweep = { ok: true, headroom: 0.9, throttled: false, reason: null }
const failed: Sweep = { ok: false, headroom: null, throttled: false, reason: "ShopifyRefused" }

const holding = (verdicts: ReturnType<typeof assess>) =>
  Object.entries(verdicts).filter(([, v]) => typeof v === "object").map(([k]) => k).toSorted()

describe("assess", () => {
  it("finds nothing on a healthy connection", () => {
    expect(holding(assess(healthy, fine, new Map(), NOW))).toEqual([])
  })

  it("opens a webhook gap when Shopify still changes orders but no delivery came for two hours", () => {
    const o = { ...healthy, lastOrderDeliveryAt: NOW - 5 * HOUR, ordersWatermarkAt: NOW - HOUR }
    const gap = assess(o, fine, new Map(), NOW).webhook_gap
    expect(gap).toMatchObject({
      facts: { since: NOW - 5 * HOUR },
      tried: [{ step: "reconcile", since: NOW - 5 * HOUR }]
    })
    // A quiet store (no order changed either) is no gap.
    expect(assess({ ...o, ordersWatermarkAt: NOW - 6 * HOUR }, fine, new Map(), NOW).webhook_gap).toBe("ended")
    // Open, it holds on the rewound watermark, and only a delivery after it opened ends it.
    const open = new Map([["webhook_gap" as const, NOW - HOUR]])
    expect(typeof assess({ ...o, ordersWatermarkAt: NOW - 5 * HOUR }, fine, open, NOW).webhook_gap).toBe("object")
    expect(assess({ ...o, lastOrderDeliveryAt: NOW - 60_000 }, fine, open, NOW).webhook_gap).toBe("ended")
  })

  it("warns a week before the grant lapses, and says the grant is gone once Shopify refused", () => {
    expect(assess({ ...healthy, refreshExpiresAt: NOW + 3 * DAY }, fine, new Map(), NOW).token_expiring).toMatchObject({
      facts: { expiresAt: NOW + 3 * DAY }
    })
    const gone = assess({ ...healthy, connectionStatus: "token_expired" }, undefined, new Map(), NOW)
    expect(holding(gone)).toEqual(["token_expired"])
    expect(gone.token_expired).toMatchObject({ tried: [{ step: "refresh", outcome: "refused" }] })
  })

  it("names the scopes the sync misses; a write scope covers its read", () => {
    expect(missingScopes(["read_orders", "write_products"])).toEqual(["read_customers"])
    expect(assess({ ...healthy, scopes: ["read_orders"] }, fine, new Map(), NOW).scope_missing).toMatchObject({
      facts: { missing: ["read_products", "read_customers"] }
    })
  })

  it("opens sync_failed on the second failed sweep, and leaves it alone on a check that did not sweep", () => {
    expect(assess({ ...healthy, failures: 1 }, failed, new Map(), NOW).sync_failed).toBe("unknown")
    expect(assess({ ...healthy, failures: 2 }, failed, new Map(), NOW).sync_failed).toMatchObject({
      again: [{ step: "reconcile", outcome: "failed", reason: "ShopifyRefused" }]
    })
    const open = new Map([["sync_failed" as const, NOW - HOUR]])
    expect(assess(healthy, undefined, open, NOW).sync_failed).toBe("unknown")
    expect(assess(healthy, fine, open, NOW).sync_failed).toBe("ended")
  })

  it("calls the rate limit near under a tenth of the bucket, or when Shopify throttled", () => {
    expect(assess(healthy, { ...fine, headroom: 0.04 }, new Map(), NOW).rate_limited).toMatchObject({
      facts: { headroom: 0.04 }
    })
    expect(typeof assess(healthy, { ...fine, headroom: 0, throttled: true }, new Map(), NOW).rate_limited).toBe(
      "object"
    )
  })

  it("ends everything on a store that was let go", () => {
    const verdicts = assess({ ...healthy, storeStatus: "disconnected" }, undefined, new Map(), NOW)
    expect(Object.values(verdicts).every((v) => v === "ended")).toBe(true)
  })
})

describe("needsWrite", () => {
  const gapOpen: OpenIncident = {
    kind: "webhook_gap",
    openedAt: NOW - HOUR,
    facts: { since: NOW - 5 * HOUR },
    told: true
  }
  const gapping = { ...healthy, lastOrderDeliveryAt: NOW - 5 * HOUR, ordersWatermarkAt: NOW - 5 * HOUR }

  it("has nothing to write for a healthy connection, or one whose open incident holds unchanged", () => {
    expect(needsWrite(healthy, fine, [], NOW)).toBe(false)
    expect(needsWrite(gapping, fine, [gapOpen], NOW)).toBe(false)
  })

  it("writes for a new finding, one that ended, a failed sweep, and one nobody heard of", () => {
    expect(needsWrite({ ...healthy, scopes: ["read_orders"] }, fine, [], NOW)).toBe(true)
    expect(needsWrite({ ...gapping, lastOrderDeliveryAt: NOW - 60_000 }, fine, [gapOpen], NOW)).toBe(true)
    expect(needsWrite(healthy, failed, [], NOW)).toBe(true)
    expect(needsWrite(gapping, fine, [{ ...gapOpen, told: false }], NOW)).toBe(true)
  })

  it("writes when the facts of an open incident moved", () => {
    const rate: OpenIncident = { kind: "rate_limited", openedAt: NOW - HOUR, facts: { headroom: 0.05 }, told: true }
    expect(needsWrite(healthy, { ...fine, headroom: 0.05 }, [rate], NOW)).toBe(false)
    expect(needsWrite(healthy, { ...fine, headroom: 0.02 }, [rate], NOW)).toBe(true)
  })
})

describe("the words", () => {
  it("says what is wrong and what Insyte already did, in Dutch", () => {
    expect(findingSentence("scope_missing", { missing: ["read_products", "read_customers"] })).toBe(
      "Insyte mag de producten en klanten niet meer lezen."
    )
    expect(findingSentence("token_expiring", { expiresAt: NOW + 3 * DAY }, NOW)).toBe(
      "De toegang tot Shopify verloopt over 3 dagen."
    )
    expect(triedSummary(["Vroeg Shopify om een nieuw token; Shopify weigerde"])).toBe(
      "Insyte deed al dit: vroeg Shopify om een nieuw token; Shopify weigerde."
    )
  })

  it("puts a connection in a word: broken over warning over importing", () => {
    expect(stateOf("connected", [])).toBe("ok")
    expect(stateOf("connected", ["webhook_gap"])).toBe("warning")
    expect(stateOf("connected", ["webhook_gap", "scope_missing"])).toBe("broken")
    expect(stateOf("action_required", [])).toBe("broken")
    expect(stateOf("connecting", [])).toBe("importing")
  })
})
