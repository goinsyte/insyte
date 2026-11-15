import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import type { AgentTask } from "@insyte/modules/agent/domain/Triggers"
import { Effect } from "effect"
import type * as AgentSink from "../../platform/AgentSink.ts"
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
 * A ticket to classify (M15 step 2) and a trigger the agent sink heard (M15 step 6) run beside the batch's deliveries,
 * not before or after them, and are acked on their own: a slow model holds up no event, and a failed delivery does not
 * ask the model again.
 */
export const queue: ExportedHandlerQueueHandler<Env, EventsMessage | IngestMessage> = async (batch, _env, ctx) => {
  // The batch's own exporter (`Observability.ts`), flushed after the acks, in at most three seconds.
  const spans = Telemetry.open()
  try {
    if (batch.queue.startsWith("insyte-ingest")) return await ingest(batch as MessageBatch<IngestMessage>, spans)
    const messages = (batch as MessageBatch<EventsMessage>).messages
    const classified = Promise.all(messages.flatMap((m) =>
      "classifyTicket" in m.body
        ? [
          background.runPromise(spans.provide(withRequestDb(classify(m.body.classifyTicket)))).then(
            () => m.ack(),
            () => m.retry()
          )
        ]
        : []
    ))
    const acted = Promise.all(messages.flatMap((m) =>
      "agent" in m.body
        ? [
          background.runPromise(spans.provide(withRequestDb(agentAct(m.body.agent)))).then(
            () => m.ack(),
            () => m.retry()
          )
        ]
        : []
    ))
    const outboxIds = messages.flatMap((m) => ("outboxIds" in m.body ? m.body.outboxIds : []))
    if (outboxIds.length > 0) await background.runPromise(spans.provide(withRequestDb(deliver(outboxIds))))
    await classified
    await acted
    batch.ackAll()
  } finally {
    ctx.waitUntil(spans.flush())
  }
}

/** A ticket's topic by Insyte AI; the rules' topic stands whatever happens here, so nothing here throws. */
const classify = (task: { readonly workspaceId: string; readonly ticketId: string }) =>
  withAi((ai) => ai.classifyTicket(task.ticketId)).pipe(
    Effect.provideService(CurrentWorkspace, { id: task.workspaceId as WorkspaceId }),
    Effect.catchCause((cause) => Effect.logWarning("a ticket's topic was not classified", { cause }))
  )

let agentSink: Promise<typeof AgentSink> | undefined

/**
 * A trigger for the agent (`relay/subscribers/agent.ts`): `AgentSink.ts`, with the slices' use cases it runs, is loaded
 * on the first task an isolate sees, not when the jobs Worker starts. A task acts once however often it comes.
 */
const agentAct = (task: AgentTask) =>
  Effect.tryPromise(() =>
    agentSink ??= import("../../platform/AgentSink.ts").catch((error: unknown) => {
      agentSink = undefined
      throw error
    })
  ).pipe(
    Effect.flatMap((sink) => sink.act(task)),
    Effect.catchCause((cause) => Effect.logWarning("the agent's task did not run", { cause }))
  )
