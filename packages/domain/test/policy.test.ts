import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { AREA_IDS, SPECIAL_IDS } from "../src/Permissions.ts"
import * as Policy from "../src/Policy.ts"
import { CurrentPrincipal, type Principal } from "../src/Principal.ts"

/*
 * `Policy` for a staff session looking along (`staff_viewer`, M18): whatever its role claims, every area at Bekijken
 * and nothing past it, and no special action. A member with the same role keeps what the role gives.
 */

const levels = Object.fromEntries(AREA_IDS.map((a) => [a, 3])) as unknown as Principal["role"]["levels"]
const specials = Object.fromEntries(SPECIAL_IDS.map((s) => [s, true])) as unknown as Principal["role"]["specials"]

const as = (kind: Principal["kind"]): Principal => ({
  kind,
  id: "sts_x",
  userId: null as never,
  workspaceId: "ws_x" as never,
  partnerId: null,
  // A role that claims everything, to show it is the kind that refuses.
  role: { id: "admin", label: "Alles", version: 1, levels, specials, refundLimit: null, stores: "all" },
  storeScope: null
})

const allowed = (principal: Principal, effect: Effect.Effect<void, unknown, CurrentPrincipal>) =>
  Exit.isSuccess(Effect.runSyncExit(Effect.provideService(effect, CurrentPrincipal, principal)))

describe("Policy for a staff session", () => {
  it("lets it read every area", () => {
    for (const area of AREA_IDS) expect(allowed(as("staff_viewer"), Policy.require(area, 1)), area).toBe(true)
  })

  it("refuses it every level past Bekijken, whatever its role says", () => {
    for (const area of AREA_IDS) {
      for (const level of [2, 3] as const) {
        expect(allowed(as("staff_viewer"), Policy.require(area, level)), `${area} ${level}`).toBe(false)
        expect(allowed(as("member"), Policy.require(area, level)), `${area} ${level}`).toBe(true)
      }
    }
  })

  it("refuses it every special action", () => {
    for (const special of SPECIAL_IDS) {
      expect(allowed(as("staff_viewer"), Policy.requireAction(special)), special).toBe(false)
      expect(allowed(as("member"), Policy.requireAction(special)), special).toBe(true)
    }
  })
})
