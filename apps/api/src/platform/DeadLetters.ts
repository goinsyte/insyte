import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { IngestMessage } from "./IngestQueue.ts"
import type { EventsMessage } from "./Relay.ts"

/*
 * The dead-letter queues' consumer (W13.6), loaded by the jobs Worker on the first dead message an isolate sees: each
 * message the queues gave up on is written down in `dead_letters` (0109: queue, message id, kind, workspace, the first
 * error's code, tries, time; never the body's words) and is an error in the log, then acked. Nothing is lost by the
 * ack: the outbox and `inbound_events` still hold what the message pointed at (the sweeps and the runbooks repair from
 * there), and a task a person would miss is still in `pending_tasks`, which the cron sends again.
 * `/api/health/deep` counts them.
 */

type DeadMessage = EventsMessage | IngestMessage

type Kind = "outbox" | "ingest" | "agent" | "classify_ticket" | "embed_knowledge" | "unknown"

/** What a dead message is, and the workspace it is of where its body says so. */
const kindOf = (body: unknown): { readonly kind: Kind; readonly workspaceId: string | null } => {
  const b = (typeof body === "object" && body !== null ? body : {}) as Partial<Record<string, unknown>>
  const ws = (v: unknown) =>
    typeof v === "object" && v !== null && typeof (v as { workspaceId?: unknown }).workspaceId === "string"
      ? (v as { workspaceId: string }).workspaceId
      : null
  if (Array.isArray(b["outboxIds"])) return { kind: "outbox", workspaceId: null }
  if (typeof b["inboundEventId"] === "string") return { kind: "ingest", workspaceId: ws(b) }
  if ("agent" in b) return { kind: "agent", workspaceId: ws(b["agent"]) }
  if ("classifyTicket" in b) return { kind: "classify_ticket", workspaceId: ws(b["classifyTicket"]) }
  if ("embedKnowledge" in b) return { kind: "embed_knowledge", workspaceId: ws(b["embedKnowledge"]) }
  return { kind: "unknown", workspaceId: null }
}

/** The leading tag of a stored error (`ShopifyThrottled: …` → `ShopifyThrottled`), never the rest of it. */
const tagOf = (error: string | null | undefined) => /^[A-Za-z][\w.-]{0,79}/.exec(error ?? "")?.[0] ?? null

/** The first error's code where the database kept one (a delivery's error, an outbox row's reason), and the workspace. */
const codeOf = Effect.fn("DeadLetters.code")(function*(
  kind: Kind,
  body: unknown,
  workspaceId: string | null
) {
  const db = yield* Db
  if (kind === "ingest" && workspaceId !== null) {
    const [row] = yield* db.scopedFor((sql) =>
      sql<{ error: string | null }>`select error from inbound_events
                                    where id = ${(body as IngestMessage).inboundEventId}`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))
    return { code: tagOf(row?.error), workspaceId }
  }
  if (kind === "outbox") {
    const ids = (body as { outboxIds: ReadonlyArray<string> }).outboxIds
    const owners = yield* db.unscopedForCron((sql) =>
      sql<{ id: string; workspaceId: string }>`select id, workspace_id from outbox_workspaces(${[...ids]})`
    )
    const first = owners[0]
    if (first === undefined) return { code: null, workspaceId: null }
    const [row] = yield* db.scopedFor((sql) =>
      sql<{ reason: string | null }>`select dead_letter_reason as reason from outbox where id = ${first.id}`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: first.workspaceId as WorkspaceId }))
    // "sink <name> failed: <Code>" (`Relay.failed`): the code; any other reason is its own.
    const code = row?.reason?.startsWith("sink ") === true ? row.reason.split(": ")[1] ?? null : row?.reason ?? null
    const workspaces = new Set(owners.map((o) => o.workspaceId))
    return {
      code: code === null ? null : code.slice(0, 80),
      workspaceId: workspaces.size === 1 ? first.workspaceId : null
    }
  }
  return { code: null, workspaceId }
})

/** One dead message written down: answers once it is (a message written down before is not written twice). */
const record = Effect.fn("DeadLetters.record")(function*(queue: string, message: Message<DeadMessage>) {
  const db = yield* Db
  const { kind, workspaceId: said } = kindOf(message.body)
  const { code, workspaceId } = yield* codeOf(kind, message.body, said).pipe(
    Effect.catchCause(() => Effect.succeed({ code: null, workspaceId: said }))
  )
  yield* db.routing((sql) =>
    sql`select dead_letter_record(${queue}, ${message.id}, ${kind}, ${workspaceId}, ${code ?? "retries_spent"},
                                  ${message.attempts})`
  )
  yield* Effect.logError("queue: a message was dead-lettered", {
    queue,
    messageId: message.id,
    kind,
    workspaceId,
    code: code ?? "retries_spent",
    attempts: message.attempts
  })
})

/** Every message of a dead-letter batch written down and acked; one the database did not take comes back. */
export const deadLetters = (batch: MessageBatch<DeadMessage>) =>
  Effect.forEach(batch.messages, (message) =>
    record(batch.queue, message).pipe(
      Effect.matchCauseEffect({
        onSuccess: () => Effect.sync(() => message.ack()),
        onFailure: (cause) =>
          Effect.logError("queue: a dead letter was not written down; tried again", { cause }).pipe(
            Effect.andThen(Effect.sync(() => message.retry({ delaySeconds: 60 })))
          )
      })
    ), { discard: true })
