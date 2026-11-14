import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  waitOnExecutionContext
} from "cloudflare:test"
import { env } from "cloudflare:workers"
import { beforeEach, expect, it, vi } from "vitest"
import worker from "../src/Local.ts"
import type { IngestMessage } from "../src/platform/Ingest.ts"
import type { EventsMessage } from "../src/platform/Relay.ts"

/*
 * Each entry point sends its own spans (`Observability.ts`): the queue's two consumers and the cron, through the
 * Worker's handlers with export on (`vitest.telemetry.config.ts`). An entry point that runs a program without
 * `spans.provide` sends nothing of it, and fails here.
 */

const posted: Array<string> = []
const network = globalThis.fetch
vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  if (!url.startsWith("http://otlp.test/")) return network(input, init)
  const body = JSON.parse(String(init?.body)) as {
    resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ name: string }> }> }>
  }
  posted.push(...body.resourceSpans.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans.map((span) => span.name))))
  return Promise.resolve(new Response("{}", { status: 200 }))
})

beforeEach(() => {
  posted.length = 0
})

it("sends the relay consumer's spans", async () => {
  const ctx = createExecutionContext()
  const batch = createMessageBatch<EventsMessage>("insyte-events", [
    { id: "m-events", timestamp: new Date(), attempts: 1, body: { outboxIds: [crypto.randomUUID()] } }
  ])
  await worker.queue(batch, env, ctx)
  await waitOnExecutionContext(ctx)
  expect(posted).toEqual(expect.arrayContaining(["Relay.deliver"]))
})

it("sends the ingest consumer's spans", async () => {
  const ctx = createExecutionContext()
  const batch = createMessageBatch<IngestMessage>("insyte-ingest", [
    {
      id: "m-ingest",
      timestamp: new Date(),
      attempts: 1,
      body: { inboundEventId: crypto.randomUUID(), workspaceId: crypto.randomUUID() }
    }
  ])
  await worker.queue(batch, env, ctx)
  await waitOnExecutionContext(ctx)
  expect(posted).toEqual(expect.arrayContaining(["Stores.webhooks.apply", "sql.transaction"]))
})

it("sends each cron job's spans", async () => {
  const ctx = createExecutionContext()
  worker.scheduled(
    createScheduledController({ cron: "* * * * *", scheduledTime: new Date("2026-11-13T10:01:00Z").getTime() }),
    env,
    ctx
  )
  await waitOnExecutionContext(ctx)
  // The minute's three jobs, each on its own exporter.
  expect(posted).toEqual(expect.arrayContaining(["Relay.sweep", "Relay.notifySweep", "Relay.webhooksRearm"]))
})
