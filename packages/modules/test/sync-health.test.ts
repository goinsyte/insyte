import { describe, expect, it } from "vitest"
import {
  assess,
  findingSentence,
  handlingSentence,
  missingScopes,
  type Observed,
  type OpenIncident,
  remedySentence,
  resolvedFindingSentence,
  stateOf,
  triedSentence,
  triedSummary,
  when
} from "../src/stores/domain/Health.ts"
import { ShopifyRefused, TokenRefused } from "../src/stores/domain/Ports.ts"
import { refusalOf } from "../src/stores/use-cases/backfill.ts"
import { grantGone } from "../src/stores/use-cases/token.ts"

/*
 * Sync health's decision (M17 step 6), pure: what holds for a connection given what the tables say, the sweeps'
 * outcomes on the connection included, and the incidents already open on it.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
// 03:00 in Amsterdam.
const NOW = Date.UTC(2026, 10, 13, 2, 0)

const healthy: Observed = {
  connectionStatus: "connected",
  storeStatus: "connected",
  scopes: ["read_orders", "read_products", "read_customers"],
  refreshExpiresAt: NOW + 90 * DAY,
  lastOrderDeliveryAt: NOW - 10 * MINUTE,
  ordersWatermarkAt: NOW - 5 * MINUTE,
  importedAt: NOW - 3 * DAY,
  connectedAt: NOW - 3 * DAY,
  lastSweptAt: NOW - 10 * MINUTE,
  throttledAt: null,
  failures: 0,
  failure: null,
  lowSweeps: 0,
  calmSweeps: 3,
  headroom: 0.9
}

const holding = (verdicts: ReturnType<typeof assess>) =>
  Object.entries(verdicts).filter(([, v]) => typeof v === "object").map(([k]) => k).toSorted()

const opened = (kind: OpenIncident["kind"], facts: OpenIncident["facts"] = {}, openedAt = NOW - HOUR) => ({
  kind,
  openedAt,
  facts
})

describe("assess", () => {
  it("finds nothing on a healthy connection", () => {
    expect(holding(assess(healthy, [], NOW))).toEqual([])
  })

  it("opens a webhook gap when Shopify still changes orders but no delivery came for two hours", () => {
    const o = { ...healthy, lastOrderDeliveryAt: NOW - 5 * HOUR, ordersWatermarkAt: NOW - HOUR }
    expect(assess(o, [], NOW).webhook_gap).toMatchObject({
      facts: { since: NOW - 5 * HOUR },
      tried: [{ step: "reconcile", outcome: "done", since: NOW - 5 * HOUR }]
    })
    // A quiet store (no order changed either) is no gap.
    expect(assess({ ...o, ordersWatermarkAt: NOW - 6 * HOUR }, [], NOW).webhook_gap).toBe("ended")
    // Open, it holds as it opened, and only a delivery after it opened ends it.
    const open = [opened("webhook_gap", { since: NOW - 5 * HOUR })]
    expect(assess(o, open, NOW).webhook_gap).toMatchObject({ facts: { since: NOW - 5 * HOUR }, again: [] })
    expect(assess({ ...o, lastOrderDeliveryAt: NOW - 2 * HOUR }, open, NOW).webhook_gap).toMatchObject({
      facts: { since: NOW - 5 * HOUR }
    })
    expect(assess({ ...o, lastOrderDeliveryAt: NOW - MINUTE }, open, NOW).webhook_gap).toBe("ended")
  })

  it("counts no gap over the time a store was gone: a reconnect is the reference, as is the import", () => {
    // The last delivery came weeks ago, before the store was let go; it was connected again an hour ago.
    const back = {
      ...healthy,
      lastOrderDeliveryAt: NOW - 20 * DAY,
      connectedAt: NOW - HOUR,
      importedAt: NOW - 50 * MINUTE,
      ordersWatermarkAt: NOW - 5 * MINUTE
    }
    expect(assess(back, [], NOW).webhook_gap).toBe("ended")
    // Three hours later still no webhook while orders change: now it is a gap, since the import.
    expect(assess(back, [], NOW + 3 * HOUR).webhook_gap).toBe("ended")
    expect(assess({ ...back, ordersWatermarkAt: NOW + 3 * HOUR }, [], NOW + 3 * HOUR).webhook_gap).toMatchObject({
      facts: { since: NOW - 50 * MINUTE }
    })
  })

  it("warns a week before the grant lapses, and says the grant is gone once Shopify refused", () => {
    expect(assess({ ...healthy, refreshExpiresAt: NOW + 3 * DAY }, [], NOW).token_expiring).toMatchObject({
      facts: { expiresAt: NOW + 3 * DAY }
    })
    const gone = assess({ ...healthy, connectionStatus: "token_expired" }, [], NOW)
    expect(holding(gone)).toEqual(["token_expired"])
    expect(gone.token_expired).toMatchObject({ tried: [{ step: "refresh", outcome: "refused" }] })
  })

  it("names the scopes the sync misses; a write scope covers its read", () => {
    expect(missingScopes(["read_orders", "write_products"])).toEqual(["read_customers"])
    expect(assess({ ...healthy, scopes: ["read_orders"] }, [], NOW).scope_missing).toMatchObject({
      facts: { missing: ["read_products", "read_customers"] }
    })
  })

  it("opens sync_failed on the second failed sweep in a row, and notes each further one", () => {
    const failing = { ...healthy, lastSweptAt: NOW - 30 * MINUTE, failure: "ShopifyRefused" }
    expect(assess({ ...failing, failures: 1 }, [], NOW).sync_failed).toBe("ended")
    expect(assess({ ...failing, failures: 2 }, [], NOW).sync_failed).toMatchObject({
      facts: { since: NOW - 30 * MINUTE, failures: 2 },
      tried: [{ step: "reconcile", outcome: "failed", reason: "ShopifyRefused" }],
      again: []
    })
    const open = [opened("sync_failed", { since: NOW - 30 * MINUTE, failures: 2 })]
    expect(assess({ ...failing, failures: 2 }, open, NOW).sync_failed).toMatchObject({ again: [] })
    expect(assess({ ...failing, failures: 3 }, open, NOW).sync_failed).toMatchObject({
      facts: { failures: 3 },
      again: [{ step: "reconcile", outcome: "failed" }]
    })
    // A sweep that went through ends it.
    expect(assess(healthy, open, NOW).sync_failed).toBe("ended")
  })

  it("opens sync_failed on a store no sweep read through for an hour, failure or not", () => {
    const starved = { ...healthy, lastSweptAt: NOW - 2 * HOUR }
    expect(assess(starved, [], NOW).sync_failed).toMatchObject({ facts: { since: NOW - 2 * HOUR }, tried: [] })
    // Never swept since the import: the import is when it last synced.
    expect(assess({ ...healthy, lastSweptAt: null, importedAt: NOW - 3 * HOUR }, [], NOW).sync_failed)
      .toMatchObject({ facts: { since: NOW - 3 * HOUR } })
    // A throttled sweep is one that got to the store.
    expect(assess({ ...starved, throttledAt: NOW - 10 * MINUTE }, [], NOW).sync_failed).toBe("ended")
  })

  it("keeps the rate limit off one low sweep, opens it on two, and lets it go after two calm ones", () => {
    expect(assess({ ...healthy, lowSweeps: 1, calmSweeps: 0, headroom: 0.04 }, [], NOW).rate_limited).toBe("ended")
    const low = { ...healthy, lowSweeps: 2, calmSweeps: 0, headroom: 0.04 }
    expect(assess(low, [], NOW).rate_limited).toMatchObject({
      facts: { headroom: 0.04 },
      tried: [{ step: "throttle", outcome: "done" }]
    })
    const open = [opened("rate_limited", { headroom: 0.04 })]
    // One calm sweep between low ones: it stays as it is.
    expect(assess({ ...healthy, lowSweeps: 0, calmSweeps: 1 }, open, NOW).rate_limited).toBe("unknown")
    expect(assess({ ...healthy, lowSweeps: 0, calmSweeps: 2 }, open, NOW).rate_limited).toBe("ended")
  })

  it("does not count a throttled sweep as a failed one", () => {
    // What `noteThrottled` leaves: a low sweep, failures untouched.
    const throttled = { ...healthy, lastSweptAt: NOW - 40 * MINUTE, throttledAt: NOW - 5 * MINUTE, lowSweeps: 1 }
    expect(holding(assess(throttled, [], NOW))).toEqual([])
  })

  it("ends everything on a store that was let go", () => {
    const verdicts = assess({ ...healthy, storeStatus: "disconnected" }, [opened("webhook_gap")], NOW)
    expect(Object.values(verdicts).every((v) => v === "ended")).toBe(true)
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
    expect(findingSentence("sync_failed", { since: NOW - 2 * HOUR }, NOW)).toBe(
      "Insyte heeft sinds 01:00 niet met Shopify gesynchroniseerd."
    )
    expect(triedSentence({ at: NOW, step: "reconcile", outcome: "done", since: NOW - HOUR, reason: null }, NOW)).toBe(
      "Leest de bestellingen sinds 02:00 elk kwartier zelf bij Shopify"
    )
    expect(triedSummary(["Vroeg Shopify om een nieuw token; Shopify weigerde"])).toBe(
      "Insyte deed al dit: vroeg Shopify om een nieuw token; Shopify weigerde."
    )
  })

  it("says why a first import Shopify refused stopped, and that only the operator can mend it", () => {
    expect(findingSentence("sync_failed", { refused: "token" })).toBe(
      "De eerste import is gestopt: Shopify accepteert de toegang van Insyte niet meer."
    )
    expect(findingSentence("sync_failed", { refused: "scope", missing: ["read_customers"] })).toBe(
      "De eerste import is gestopt: Insyte mag de klanten niet lezen."
    )
    expect(findingSentence("sync_failed", { refused: "data" })).toBe(
      "De eerste import is gestopt: Shopify geeft Insyte geen toegang tot een deel van de winkelgegevens."
    )
    // Insyte does not try again: the operator does something.
    expect(handlingSentence("sync_failed", { refused: "scope", missing: ["read_customers"] })).toBeNull()
    expect(remedySentence("sync_failed", { refused: "token" })).toBe(
      "Koppel de winkel opnieuw, dan vraagt Shopify je toestemming."
    )
    // Data Shopify withholds until it approves Insyte: reconnecting does not help, so no remedy; Insyte settles it.
    expect(remedySentence("sync_failed", { refused: "data" })).toBeNull()
    expect(handlingSentence("sync_failed", { refused: "data" })).toBe("Insyte zoekt dit uit; je hoeft niets te doen")
    expect(triedSentence({ at: NOW, step: "backfill", outcome: "refused", since: null, reason: null }, NOW)).toBe(
      "Stopte de eerste import meteen: Shopify weigerde"
    )
    // A sync that fails for another reason is still Insyte's to retry.
    expect(handlingSentence("sync_failed", {})).toBe("Insyte probeert het elk kwartier opnieuw")
  })

  it("takes a 401 or a 403 as a refusal no retry changes, and a 429 or a 5xx as worth another try", () => {
    expect(refusalOf(new ShopifyRefused({ status: 401, reason: "Invalid API key" }))?.facts).toEqual({
      refused: "token"
    })
    expect(
      refusalOf(new ShopifyRefused({ status: 403, reason: "Access denied", scope: "read_customers" }))?.facts
    ).toEqual({ refused: "scope", missing: ["read_customers"] })
    expect(refusalOf(new ShopifyRefused({ status: 403, reason: "not approved" }))?.facts).toEqual({ refused: "data" })
    expect(refusalOf(new TokenRefused({ reason: "expired" }))?.facts).toEqual({ refused: "token" })
    expect(refusalOf(new TokenRefused({ reason: "disconnected" }))).toBeNull()
    expect(refusalOf(new ShopifyRefused({ status: 429, reason: "Too Many Requests" }))).toBeNull()
    expect(refusalOf(new ShopifyRefused({ status: 502, reason: "Bad Gateway" }))).toBeNull()
  })

  it("names the day of a time that is not today, so a night's finding read later says which night", () => {
    expect(when(NOW - HOUR, NOW)).toBe("02:00")
    expect(when(NOW - DAY, NOW)).toBe("12 nov 03:00")
    expect(findingSentence("webhook_gap", { since: NOW - DAY }, NOW)).toBe(
      "Er komen sinds 12 nov 03:00 geen webhooks van Shopify binnen."
    )
  })

  it("says a resolved finding in the past tense, so it does not read as still going on", () => {
    expect(resolvedFindingSentence("sync_failed", {}, NOW)).toBe("Synchroniseren met Shopify lukte niet.")
    expect(resolvedFindingSentence("webhook_gap", { since: NOW - HOUR }, NOW)).toBe(
      "Er kwamen sinds 02:00 geen webhooks van Shopify binnen."
    )
    expect(resolvedFindingSentence("scope_missing", { missing: ["read_orders"] }, NOW)).toBe(
      "Insyte mocht de bestellingen niet lezen."
    )
    const kinds = [
      "webhook_gap",
      "token_expiring",
      "token_expired",
      "scope_missing",
      "rate_limited",
      "sync_failed"
    ] as const
    for (const kind of kinds) {
      expect(resolvedFindingSentence(kind, {}, NOW)).not.toBe(findingSentence(kind, {}, NOW))
    }
  })

  it("puts a connection in a word: broken over warning over importing", () => {
    expect(stateOf("connected", [])).toBe("ok")
    expect(stateOf("connected", ["webhook_gap"])).toBe("warning")
    expect(stateOf("connected", ["webhook_gap", "scope_missing"])).toBe("broken")
    expect(stateOf("action_required", [])).toBe("broken")
    expect(stateOf("connecting", [])).toBe("importing")
  })
})

describe("a refused refresh", () => {
  it("takes a 4xx as the grant gone, but a 429 as Shopify busy", () => {
    expect(grantGone(401)).toBe(true)
    expect(grantGone(400)).toBe(true)
    expect(grantGone(429)).toBe(false)
    expect(grantGone(503)).toBe(false)
  })
})
