import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import worker from "../src/Local.ts"
import type { EventsMessage } from "../src/platform/Relay.ts"
import { call } from "./support.ts"

/*
 * The dead-letter queues' consumer (W13.6): every message a queue gave up on is written down in `dead_letters`, with
 * its kind and, where its body says, its workspace, never its words; an error in the log; then acked. The same message
 * delivered twice is written down once. `/api/health/deep` counts them per queue.
 */

const run = Date.now().toString(36)

interface DeadLetters {
  events: number
  ingest: number
  lastDay: number
  lastAt: string | null
}
const counts = async () =>
  ((await (await call("http://api.test/api/health/deep")).json()) as { deadLetters: DeadLetters }).deadLetters

const dead = async (queue: string, messages: Array<{ id: string; body: unknown }>) => {
  const ctx = createExecutionContext()
  const batch = createMessageBatch<EventsMessage>(
    queue,
    messages.map((m) => ({ id: m.id, timestamp: new Date(), attempts: 6, body: m.body as EventsMessage }))
  )
  await worker.queue(batch, env, ctx)
  return getQueueResult(batch, ctx)
}

describe("the dead-letter queues", () => {
  it("writes down each message they hold, acks it, and counts it on /api/health/deep", async () => {
    const before = await counts()
    const events = await dead("insyte-events-dlq", [
      { id: `dl-${run}-1`, body: { outboxIds: [`obx_missing_${run}`] } },
      { id: `dl-${run}-2`, body: { agent: { workspaceId: `ws_${run}`, eventId: "obx_1", trigger: {} } } }
    ])
    const ingest = await dead("insyte-ingest-dlq", [
      { id: `dl-${run}-3`, body: { inboundEventId: `ibe_missing_${run}`, workspaceId: `ws_${run}` } }
    ])
    for (const result of [events, ingest]) {
      expect(result.retryMessages).toEqual([])
      expect(result.explicitAcks.length + (result.ackAll ? 1 : 0)).toBeGreaterThan(0)
    }
    const after = await counts()
    expect(after.events - before.events).toBe(2)
    expect(after.ingest - before.ingest).toBe(1)
    expect(after.lastDay - before.lastDay).toBe(3)
    expect(after.lastAt).not.toBeNull()
  })

  it("writes a message delivered twice down once", async () => {
    const message = { id: `dl-${run}-again`, body: { classifyTicket: { workspaceId: `ws_${run}`, ticketId: "t_1" } } }
    await dead("insyte-events-dlq", [message])
    const once = await counts()
    await dead("insyte-events-dlq", [message])
    expect((await counts()).events).toBe(once.events)
  })
})
