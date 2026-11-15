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
 * A ticket to classify (M15 step 2), a trigger the agent sink heard (M15 step 6) and a chapter to embed (M15 step 7) run beside the batch's deliveries,
 * not before or after them, and are acked or retried on their own: a slow model holds up no event, a failed delivery
 * does not ask the model again, and a task that could not run (the database away) comes back rather than being lost.
 */
export const queue: ExportedHandlerQueueHandler<Env, EventsMessage | IngestMessage> = async (batch, _env, ctx) => {
  // The batch's own exporter (`Observability.ts`), flushed after the acks, in at most three seconds.
  const spans = Telemetry.open()
  try {
    if (batch.queue.startsWith("insyte-ingest")) return await ingest(batch as MessageBatch<IngestMessage>, spans)
    const messages = (batch as MessageBatch<EventsMessage>).messages
    // A topic never throws (it logs and leaves the rules' topic). An agent's task throws only when it could not run at
    // all: it is retried, and acts once however often it comes. Each is acked or retried when it is done; all of them
    // are waited for, whatever the deliveries beside them do.
    const settle = (m: (typeof messages)[number], run: Promise<unknown>) => run.then(() => m.ack(), () => m.retry())
    const beside = Promise.allSettled(messages.flatMap((m) =>
      "classifyTicket" in m.body
        ? [settle(m, background.runPromise(spans.provide(withRequestDb(classify(m.body.classifyTicket)))))]
        : "agent" in m.body
        ? [settle(m, background.runPromise(spans.provide(withRequestDb(agentAct(m.body.agent)))))]
        : "embedKnowledge" in m.body
        ? [settle(m, background.runPromise(spans.provide(withRequestDb(embed(m.body.embedKnowledge)))))]
        : []
    ))
    const deliveries = messages.filter((m) => "outboxIds" in m.body)
    const outboxIds = deliveries.flatMap((m) => ("outboxIds" in m.body ? m.body.outboxIds : []))
    try {
      if (outboxIds.length > 0) await background.runPromise(spans.provide(withRequestDb(deliver(outboxIds))))
    } finally {
      await beside
    }
    // The deliveries acked; a task beside them has said for itself, and a batch of tasks is not acked whole over it.
    if (deliveries.length === messages.length) batch.ackAll()
    else for (const m of deliveries) m.ack()
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

/**
 * A published chapter's pieces embedded (M15 step 7), with the slice loaded on the first such task. The embedder failing, or the database away, fails here and the
 * queue hands it over again; a piece embedded already is not embedded twice, and a stage with no embedder or a spent
 * budget leaves the pieces to be found by their words.
 */
const embed = (task: { readonly workspaceId: string; readonly articleId: string; readonly version: number }) =>
  Effect.tryPromise(() =>
    Promise.all([import("@insyte/modules/knowledge/Knowledge"), import("../../platform/Embeddings.ts")])
  ).pipe(
    Effect.flatMap(([knowledge, embeddings]) =>
      embeddings.withEmbedder(knowledge.embedArticle(task.articleId, task.version))
    ),
    Effect.provideService(CurrentWorkspace, { id: task.workspaceId as WorkspaceId }),
    Effect.tapCause((cause) => Effect.logWarning("a chapter was not embedded; it is tried again", { cause }))
  )

let agentSink: Promise<typeof AgentSink> | undefined

/**
 * A trigger for the agent (`relay/subscribers/agent.ts`): `AgentSink.ts`, with the slices' use cases it runs, is loaded
 * on the first task an isolate sees, not when the jobs Worker starts. A task acts once however often it comes, so one
 * that failed to load or to reach the database fails here, and the queue hands it over again.
 */
const agentAct = (task: AgentTask) =>
  Effect.tryPromise(() =>
    agentSink ??= import("../../platform/AgentSink.ts").catch((error: unknown) => {
      agentSink = undefined
      throw error
    })
  ).pipe(
    Effect.flatMap((sink) => sink.act(task)),
    Effect.tapCause((cause) => Effect.logWarning("the agent's task did not run; it is tried again", { cause }))
  )
