import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { withAi } from "../../platform/Ai.ts"
import { BackgroundRuntime as background } from "../../platform/BackgroundLayer.ts"
import type { Env } from "../../platform/Env.ts"
import { ingest, type IngestMessage } from "../../platform/Ingest.ts"
import { Telemetry } from "../../platform/Observability.ts"
import { deliver, type EventsMessage } from "../../platform/Relay.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/**
 * The outbox relay's consumer (M1.4): a throw leaves the batch to the queue's retries, then its dead letters. And
 * Shopify's webhooks (M6.3), each delivery acked or retried on its own.
 *
 * A ticket to classify (M15 step 2) runs beside the batch's deliveries, not before or after them, and is acked on its
 * own: a slow model holds up no event, and a failed delivery does not ask the model again.
 */
export const queue: ExportedHandlerQueueHandler<Env, EventsMessage | IngestMessage> = async (batch, _env, ctx) => {
  if (batch.queue.startsWith("insyte-ingest")) return ingest(batch as MessageBatch<IngestMessage>)
  const messages = (batch as MessageBatch<EventsMessage>).messages
  try {
    const classified = Promise.all(messages.flatMap((m) =>
      "classifyTicket" in m.body
        ? [
          background.runPromise(withRequestDb(classify(m.body.classifyTicket))).then(() => m.ack(), () => m.retry())
        ]
        : []
    ))
    const outboxIds = messages.flatMap((m) => ("outboxIds" in m.body ? m.body.outboxIds : []))
    if (outboxIds.length > 0) await background.runPromise(withRequestDb(deliver(outboxIds)))
    await classified
    batch.ackAll()
  } finally {
    ctx.waitUntil(Telemetry.flush())
  }
}

/** A ticket's topic by Insyte AI; the rules' topic stands whatever happens here, so nothing here throws. */
const classify = (task: { readonly workspaceId: string; readonly ticketId: string }) =>
  withAi((ai) => ai.classifyTicket(task.ticketId)).pipe(
    Effect.provideService(CurrentWorkspace, { id: task.workspaceId as WorkspaceId }),
    Effect.catchCause((cause) => Effect.logWarning("a ticket's topic was not classified", { cause }))
  )
