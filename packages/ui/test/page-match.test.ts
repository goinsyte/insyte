import { describe, expect, it } from "vitest"
import { pageMatcher } from "../src/app/lib/page-match.ts"

// A host's routes as TanStack Router keys them (`routesByPath`): the console's shapes, a record's id as `$param`.
const hasPage = pageMatcher([
  "/",
  "/orders",
  "/orders/$orderId",
  "/suppliers/$supplierId/statements/$month",
  "/settings/ai/limits",
  "/ask/activity",
  "/files/$"
])

describe("a host's pages", () => {
  it("answers a page it has, a search, a hash or a trailing slash aside", () => {
    expect(hasPage("/orders")).toBe(true)
    expect(hasPage("/orders/")).toBe(true)
    expect(hasPage("/settings/ai/limits?tab=people#top")).toBe(true)
    expect(hasPage("/")).toBe(true)
  })

  it("answers a record's address by its route's pattern", () => {
    expect(hasPage("/orders/ord_12")).toBe(true)
    expect(hasPage("/orders/ord_12?view=lines")).toBe(true)
    expect(hasPage("/suppliers/sup_3/statements/2026-10")).toBe(true)
    expect(hasPage("/files/a/b/c")).toBe(true)
  })

  it("leaves out what no route answers", () => {
    expect(hasPage("/ask")).toBe(false)
    expect(hasPage("/settings/billing")).toBe(false)
    expect(hasPage("/orders/ord_12/lines")).toBe(false)
    expect(hasPage("/suppliers/sup_3/statements")).toBe(false)
    expect(hasPage("/notifications")).toBe(false)
  })
})
