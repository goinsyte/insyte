import { BackgroundRuntime as background } from "../../platform/BackgroundLayer.ts"
import type { Env } from "../../platform/Env.ts"
import { ingest, type IngestMessage } from "../../platform/Ingest.ts"
import { Telemetry } from "../../platform/Observability.ts"
import { deliver, type EventsMessage } from "../../platform/Relay.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/**
 * The outbox relay's consumer (M1.4): a throw leaves the batch to the queue's retries, then its dead letters. And
 * Shopify's webhooks (M6.3), each delivery acked or retried on its own.
 */
export const queue: ExportedHandlerQueueHandler<Env, EventsMessage | IngestMessage> = async (batch, _env, ctx) => {
  // The batch's own exporter (`Observability.ts`), flushed after the acks, in at most three seconds.
  const spans = Telemetry.open()
  try {
    if (batch.queue.startsWith("insyte-ingest")) return await ingest(batch as MessageBatch<IngestMessage>, spans)
    const events = batch as MessageBatch<EventsMessage>
    await background.runPromise(spans.provide(withRequestDb(deliver(events.messages.flatMap((m) => m.body.outboxIds)))))
    batch.ackAll()
  } finally {
    ctx.waitUntil(spans.flush())
  }
}
