import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import type { AgentTask } from "@insyte/modules/agent/domain/Triggers"
import { Effect, Exit } from "effect"
import type * as AgentSink from "../../platform/AgentSink.ts"
import { withAi } from "../../platform/Ai.ts"
import { BackgroundRuntime as background } from "../../platform/BackgroundLayer.ts"
import type * as DeadLetters from "../../platform/DeadLetters.ts"
import type { Env } from "../../platform/Env.ts"
import { ingest, type IngestMessage } from "../../platform/Ingest.ts"
import { type Spans, Telemetry } from "../../platform/Observability.ts"
import { deliver, type EventsMessage } from "../../platform/Relay.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/**
 * The outbox relay's consumer (M1.4): each message acked, or retried when the database could not be reached for it,
 * then its dead letters (an event that fails is held back by the relay itself, W13.6). And
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
    // What the queues gave up on (W13.6): written down and acked, by a module loaded on the first such batch.
    if (batch.queue.includes("-dlq")) return await deadLetterBatch(batch, spans)
    if (batch.queue.startsWith("insyte-ingest")) return await ingest(batch as MessageBatch<IngestMessage>, spans)
    const messages = (batch as MessageBatch<EventsMessage>).messages
    // A topic never throws (it logs and leaves the rules' topic). An agent's task throws only when it could not run at
    // all: it is retried, and acts once however often it comes. Each is acked or retried when it is done; all of them
    // are waited for, whatever the deliveries beside them do.
    const settle = (m: (typeof messages)[number], run: Promise<unknown>) => run.then(() => m.ack(), () => m.retry())
    // Each, once it ran, leaves `pending_tasks` (W13.6), so the cron does not send it again.
    const beside = Promise.allSettled(messages.flatMap((m) => {
      const b = m.body
      if ("classifyTicket" in b) {
        const { workspaceId, eventId } = b.classifyTicket
        const run = Effect.andThen(classify(b.classifyTicket), ranTask("classify_ticket", workspaceId, eventId))
        return [settle(m, background.runPromise(spans.provide(withRequestDb(run))))]
      }
      if ("agent" in b) {
        const run = Effect.andThen(agentAct(b.agent), ranTask("agent", b.agent.workspaceId, b.agent.eventId))
        return [settle(m, background.runPromise(spans.provide(withRequestDb(run))))]
      }
      if ("embedKnowledge" in b) {
        const { workspaceId, eventId } = b.embedKnowledge
        const run = Effect.andThen(embed(b.embedKnowledge), ranTask("embed_knowledge", workspaceId, eventId))
        return [settle(m, background.runPromise(spans.provide(withRequestDb(run))))]
      }
      return []
    }))
    // Each message's events on their own: an event that fails waits for its own try again (`Relay.deliver`), so a
    // message goes back to the queue only when the database could not be reached for it.
    const deliveries = messages.filter((m) => "outboxIds" in m.body)
    const unreached = new Set<(typeof messages)[number]>()
    try {
      for (const m of deliveries) {
        const outboxIds = "outboxIds" in m.body ? m.body.outboxIds : []
        if (outboxIds.length === 0) continue
        const delivered = deliver(outboxIds).pipe(
          Effect.tapCause((cause) =>
            Effect.logError("outbox: a message's events were not reached; the queue tries it again", { cause })
          )
        )
        const exit = await background.runPromiseExit(spans.provide(withRequestDb(delivered)))
        if (Exit.isFailure(exit)) unreached.add(m)
      }
    } finally {
      await beside
    }
    // A task beside the deliveries has said for itself, and a batch of tasks is not acked whole over it.
    if (deliveries.length === messages.length && unreached.size === 0) return batch.ackAll()
    for (const m of deliveries) {
      if (unreached.has(m)) m.retry()
      else m.ack()
    }
  } finally {
    ctx.waitUntil(spans.flush())
  }
}

type PendingKind = "agent" | "classify_ticket" | "embed_knowledge"

/** A task that ran, out of `pending_tasks`; one that cannot be taken out now is sent again once by the cron. */
const ranTask = (kind: PendingKind, workspaceId: string, ref: string | undefined) =>
  ref === undefined ?
    Effect.void :
    Effect.flatMap(Effect.service(Db), (db) =>
      db.scopedFor((sql) => sql`delete from pending_tasks where kind = ${kind} and ref = ${ref}`)).pipe(
        Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
        Effect.catchCause((cause) =>
          Effect.logWarning("a task that ran was not crossed off", { cause })
        )
      )

let deadLetterModule: Promise<typeof DeadLetters> | undefined

/** A dead-letter queue's batch (`platform/DeadLetters.ts`), loaded on the first one an isolate sees. */
const deadLetterBatch = async (batch: MessageBatch<EventsMessage | IngestMessage>, spans: Spans) => {
  const module = await (deadLetterModule ??= import("../../platform/DeadLetters.ts").catch((error: unknown) => {
    deadLetterModule = undefined
    throw error
  }))
  await background.runPromise(spans.provide(withRequestDb(module.deadLetters(batch))))
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
