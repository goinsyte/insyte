import { describe, expect, it } from "vitest"
import { toggleStore } from "../src/app/lib/team-core.ts"

// The store picker (invitations, a member's stores, roles, API keys, webhooks): a click on one store's chip.
describe("a store chip clicked", () => {
  it("narrows every store to the one clicked", () => {
    expect(toggleStore("all", "store_1")).toEqual(["store_1"])
  })

  it("never turns a pick into every store, the ones connected later included", () => {
    // One store in the workspace: picking it is that store, not "all".
    expect(toggleStore([], "store_1")).toEqual(["store_1"])
    // Two stores, both picked: still just those two.
    expect(toggleStore(["store_1"], "store_2")).toEqual(["store_1", "store_2"])
  })

  it("takes a store off a pick, but keeps the last one rather than granting all or none", () => {
    expect(toggleStore(["store_1", "store_2"], "store_1")).toEqual(["store_2"])
    expect(toggleStore(["store_2"], "store_2")).toEqual(["store_2"])
  })
})
