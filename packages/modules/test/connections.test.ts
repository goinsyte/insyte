import { describe, expect, it } from "vitest"
import { accountStatus, storeConnection } from "../src/stores/domain/Connections.ts"

/*
 * Koppelingen's rows (widgets/05 §5.1), pure: a store's sync health in the page's terms, read as the shell's line
 * reads it, and a Klaviyo or Slack connection's stored status.
 */

const store = (storeStatus: string) => ({ storeId: "sto_1", storeName: "Noord", storeStatus, lastSyncedAt: 1_000 })

describe("a store's row", () => {
  it("is connected with nothing open, and connecting while it imports", () => {
    expect(storeConnection(store("connected"), [])).toMatchObject({
      status: "connected",
      reason: null,
      note: null,
      lastSyncedAt: 1_000
    })
    expect(storeConnection(store("connecting"), [])).toMatchObject({ status: "connecting", reason: null })
  })

  it("says to connect again when Shopify asks it, before any incident that is not broken", () => {
    const row = storeConnection(store("action_required"), [{ kind: "webhook_gap", facts: {} }])
    expect(row).toMatchObject({
      status: "action_required",
      reason: "action_required",
      note: "Koppel de winkel opnieuw, dan vraagt Shopify je toestemming."
    })
  })

  it("lets the broken incident speak before a newer warning", () => {
    const row = storeConnection(store("connected"), [
      { kind: "webhook_gap", facts: {} },
      { kind: "scope_missing", facts: { missing: ["read_customers"] } }
    ])
    expect(row).toMatchObject({ status: "action_required", reason: "scope_missing" })
    expect(row.note).toContain("niet meer lezen")
  })

  it("keeps a store with a warning connected, and says the warning", () => {
    const row = storeConnection(store("connected"), [{ kind: "token_expiring", facts: {} }])
    expect(row).toMatchObject({ status: "connected", reason: "token_expiring" })
    expect(row.note).toContain("verloopt")
  })
})

describe("a Klaviyo or Slack connection", () => {
  it("needs action when its grant is gone or short, and is none otherwise", () => {
    expect(accountStatus("connected")).toEqual({ status: "connected", reason: null })
    expect(accountStatus("rate_limited")).toEqual({ status: "connected", reason: null })
    expect(accountStatus("token_expired")).toEqual({ status: "action_required", reason: "token_expired" })
    expect(accountStatus("scope_missing")).toEqual({ status: "action_required", reason: "scope_missing" })
    expect(accountStatus(undefined)).toEqual({ status: "disconnected", reason: null })
  })
})
