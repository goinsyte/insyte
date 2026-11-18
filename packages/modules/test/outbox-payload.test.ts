import { describe, expect, it } from "vitest"
import { eventOf } from "../src/shared/domain/Outbox.ts"

/*
 * The relay reads every outbox row as its event before a sink sees it (`Relay.deliver`): the table takes any JSON, so
 * a row written by hand (a fixture's `partner.changed` without its ids) or in a shape the schema has left is
 * dead-lettered instead of breaking the realtime sink on `event.ids` every minute.
 */
describe("an outbox row as its event", () => {
  const whole = { workspaceId: "ws_1", supplierId: "sup_1", kind: "supplier_work", ids: ["ord_1"] }

  it("is the event when the payload is that event's", () => {
    expect(eventOf("partner.changed", whole)).toEqual({ type: "partner.changed", ...whole })
  })

  it("is nothing when a field the event needs is missing or of another type", () => {
    const { ids: _ids, ...withoutIds } = whole
    expect(eventOf("partner.changed", withoutIds)).toBeUndefined()
    expect(eventOf("partner.changed", { ...whole, ids: "ord_1" })).toBeUndefined()
  })

  it("is nothing for a kind of event there is no schema for", () => {
    expect(eventOf("partner.renamed", whole)).toBeUndefined()
  })
})
