import { describe, expect, it } from "vitest"
import { skeletonFor } from "../src/app/loading/kinds.ts"

/* Every route draws the skeleton of the shape it will take (ADR-0028). */
describe("skeletonFor", () => {
  it.each([
    ["/_admin/dashboard", "dashboard"],
    ["/_admin/orders", "table"],
    ["/_admin/orders/$orderId", "document"],
    ["/_admin/tickets", "board"],
    ["/_admin/inbox", "split"],
    ["/_admin/chats", "channel"],
    ["/_admin/analytics", "analytics"],
    ["/_admin/settings/profile", "settings"],
    ["/_admin/automations/$automationId", "canvas"],
    ["/_admin/sheets", "cards"],
    ["/_admin/sheets/$sheetId", "grid"],
    ["/_admin/live", "map"],
    ["/_admin/courses", "list"],
    ["/_admin/courses/learn/$courseId", "document"],
    ["/_supplier/supplier/dashboard", "overview"],
    ["/_supplier/supplier/chats", "channel"],
    ["/_aff/affiliate/settings/payment", "settings"],
    ["/_aff/affiliate/payouts/$month", "document"]
  ])("%s draws %s", (route, kind) => {
    expect(skeletonFor(route)).toBe(kind)
  })
})
