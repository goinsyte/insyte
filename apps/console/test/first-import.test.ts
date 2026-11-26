import { StoreView, SyncStatus } from "@insyte/modules/stores/domain/Stores"
import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import { firstImportKind } from "../src/onboarding/first-import.ts"

/*
 * Where onboarding's sync step says the first import is: a failed import stops the wait and says so, an import that is
 * in goes on, and stores that could not be read are no store to wait for.
 */

const store = (status: StoreView["status"]) =>
  new StoreView({
    id: "sto_1",
    name: "Northwind",
    shopDomain: "northwind.myshopify.com",
    status,
    currency: "EUR",
    country: "NL",
    timezone: "Europe/Amsterdam",
    connectedAt: 1,
    lastSyncedAt: null
  })

const sync = (status: SyncStatus["status"], lastSyncedAt: number | null) =>
  new SyncStatus({
    storeId: "sto_1",
    status,
    lastSyncedAt,
    counts: { products: 3, customers: 0, orders: 0 },
    resources: [{ resource: "products", phase: "done" }]
  })

const listed = (...stores: Array<StoreView>) => AsyncResult.success<ReadonlyArray<StoreView>, unknown>(stores)

describe("the first import on the sync step", () => {
  it("waits while the stores are read", () => {
    expect(firstImportKind(AsyncResult.initial(true), undefined)).toBe("loading")
  })

  it("has no store to wait for when there is none, or the stores could not be read", () => {
    expect(firstImportKind(listed(), undefined)).toBe("none")
    expect(firstImportKind(listed(store("disconnected")), undefined)).toBe("none")
    expect(firstImportKind(AsyncResult.fail("down"), undefined)).toBe("none")
  })

  it("is importing while the store connects, before its status is read too", () => {
    expect(firstImportKind(listed(store("connecting")), undefined)).toBe("importing")
    expect(firstImportKind(listed(store("connecting")), sync("connecting", null))).toBe("importing")
  })

  it("has failed once the backfill gave up, as the import's status or the store's says", () => {
    expect(firstImportKind(listed(store("connecting")), sync("action_required", null))).toBe("failed")
    expect(firstImportKind(listed(store("action_required")), undefined)).toBe("failed")
  })

  it("is done once the import is in, whatever the store's status says since", () => {
    expect(firstImportKind(listed(store("connected")), sync("connected", 2))).toBe("done")
    expect(firstImportKind(listed(store("action_required")), sync("action_required", 2))).toBe("done")
  })
})
