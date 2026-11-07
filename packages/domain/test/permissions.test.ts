import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  AREA_IDS,
  AREAS,
  canOpen,
  canRole,
  clampLevel,
  scopesOf,
  SPECIAL_IDS,
  SPECIALS,
  SYSTEM_DEFAULTS,
  SYSTEM_ORDER
} from "../src/Permissions.ts"
import { RoleSnapshot } from "../src/Principal.ts"

const role = (id: keyof typeof SYSTEM_DEFAULTS) => SYSTEM_DEFAULTS[id]!

describe("the permission catalogue", () => {
  it("names every area and special action once, in the order the roles page shows", () => {
    expect(AREAS.map((a) => a.id)).toEqual([...AREA_IDS])
    expect(SPECIALS.map((s) => s.id).toSorted()).toEqual([...SPECIAL_IDS].toSorted())
  })

  it("starts every workspace with the five system roles", () => {
    expect(Object.keys(SYSTEM_DEFAULTS).toSorted()).toEqual([...SYSTEM_ORDER].toSorted())
  })

  it("clamps a level to one the area offers", () => {
    expect(clampLevel("billing", 2)).toBe(1)
    expect(clampLevel("orders", 2)).toBe(2)
  })
})

describe("canRole", () => {
  it("lets the owner do everything", () => {
    expect(canRole(role("owner"), "billing", 3)).toBe(true)
  })

  it("asks an area at a level", () => {
    expect(canRole(role("view"), "orders", 1)).toBe(true)
    expect(canRole(role("view"), "orders", 2)).toBe(false)
  })

  it("holds a refund to the role's limit", () => {
    expect(canRole(role("service"), "refunds.write", 100)).toBe(true)
    expect(canRole(role("service"), "refunds.write", 101)).toBe(false)
  })

  it("gates console paths by area, longest prefix first", () => {
    expect(canOpen(role("service"), "/settings/billing")).toBe(false)
    expect(canOpen(role("finance"), "/settings/billing")).toBe(true)
    expect(canOpen(role("view"), "/onboarding")).toBe(true)
  })
})

describe("API scopes", () => {
  it("reads area access as read and write scopes", () => {
    expect(scopesOf({ orders: 2, customers: 1 })).toEqual(["orders.read", "orders.write", "customers.read"])
  })
})

describe("RoleSnapshot", () => {
  it("carries a system role as the session sends it", () => {
    const { description: _, system: __, ...owner } = role("owner")
    expect(Schema.decodeSync(RoleSnapshot)({ ...owner, version: 1 }).label).toBe("Eigenaar")
  })
})
