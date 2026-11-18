import { describe, expect, it } from "vitest"
import { erasureStuck } from "../src/app/settings/erasure-stuck.ts"

describe("a shopper's erasure that did not finish, on Je gegevens", () => {
  it("names the column, or the columns, that the shopper is left in", () => {
    expect(erasureStuck("webhooks.url")).toBe("Verwijderen lukt niet: kolom webhooks.url past niet")
    expect(erasureStuck("webhooks.url, push_subscriptions.endpoint")).toBe(
      "Verwijderen lukt niet: kolommen webhooks.url, push_subscriptions.endpoint passen niet"
    )
  })

  it("says it is tried again when the cause is not a column", () => {
    expect(erasureStuck("unexpected")).toBe("Verwijderen lukt niet, we proberen het elk uur opnieuw")
  })
})
