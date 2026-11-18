import { Arbitrary, Effect } from "effect"
import { describe, expect, it } from "vitest"
import { isWebhookSource, WEBHOOK_SOURCE_EVENTS } from "../src/developer/use-cases/deliveries.ts"
import { eventOf, OutboxEvent } from "../src/shared/domain/Outbox.ts"

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

/*
 * What `Outbox.write` writes, the relay reads (W13.4 review): every event the code can build, as the table stores it
 * (`JSON.stringify` of all but its type), is that event again, so nothing valid is set aside after a deploy. And every
 * event that can be a public webhook is one the relay never sets aside (`WEBHOOK_SOURCE_EVENTS`).
 */
describe("every event the outbox can hold", () => {
  const members = OutboxEvent.members

  it("reads back as itself once stored, for every kind of event", async () => {
    expect(members.length).toBeGreaterThan(60)
    const refused: Array<string> = []
    for (const member of members) {
      const samples = await Effect.runPromise(Arbitrary.sampleEffect(Arbitrary.schema(member), { count: 25, seed: 7 }))
      for (const sample of samples) {
        const { type, ...payload } = sample as OutboxEvent
        const stored = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
        if (eventOf(type, stored) === undefined) refused.push(type)
      }
    }
    expect([...new Set(refused)]).toEqual([])
  })

  it("names every event a webhook can come from among those never set aside", async () => {
    const missing = new Set<string>()
    const sources = new Set<string>()
    for (const member of members) {
      const samples = await Effect.runPromise(Arbitrary.sampleEffect(Arbitrary.schema(member), { count: 25, seed: 7 }))
      for (const sample of samples) {
        if (!isWebhookSource(sample as OutboxEvent)) continue
        sources.add(sample.type)
        if (!WEBHOOK_SOURCE_EVENTS.has(sample.type)) missing.add(sample.type)
      }
    }
    expect([...missing]).toEqual([])
    expect(sources.size).toBeGreaterThan(5)
  })
})
