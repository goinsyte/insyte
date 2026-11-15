import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { actOnTrigger, agentPrincipal, type Prepared } from "@insyte/modules/agent/Agent"
import { type AgentTask, promisesMoney } from "@insyte/modules/agent/domain/Triggers"
import type { Draft } from "@insyte/modules/ai/domain/Ai"
import { untracedFigures } from "@insyte/modules/ai/domain/Guards"
import { threadFacts } from "@insyte/modules/ai/use-cases/context"
import { replyOn, RESTORE as INBOX_RESTORE } from "@insyte/modules/inbox/use-cases/commands"
import { notifyDelay } from "@insyte/modules/orders/use-cases/delay-mail"
import { draftFor } from "@insyte/modules/proposals/use-cases/proposer"
import { Relay } from "@insyte/modules/shared/domain/Outbox"
import { UndoWindow } from "@insyte/modules/shared/domain/Undo"
import * as Undo from "@insyte/modules/shared/use-cases/Undo"
import { Effect } from "effect"
import { withAi } from "./Ai.ts"
import { aiMode } from "./AiSettings.ts"

/*
 * What the agent does on its own for each trigger the agent sink heard (M15 step 6; ADR-0027), on the events queue
 * after the event's transaction (`transports/jobs/Queue.ts`), loaded there on the first task an isolate sees. Each
 * trigger goes through `actOnTrigger` as the workspace's agent: claimed once, the autonomy rules asked, the slice's own
 * use case run on Zelf doen, and logged.
 *
 * - A mail asking where an order is → `SendReply`: Insyte AI writes the reply from the thread and the customer's own
 *   orders (`Drafts.reply`, budgeted); on Zelf doen it goes out through the thread's mailbox five minutes later, so the
 *   log can still take it back; otherwise it is the inbox's draft card for the team. Once per thread: after the
 *   agent's reply the team takes over.
 * - An order delayed → the delay mail (`NotifyDelayedOrder`, under `SendReply`: mailing a shopper), in the words the
 *   queue's plate draws; otherwise that plate on Start is the question.
 *
 * Nothing here logs a mail's words or an address. A trigger that fails is the team's, as it was without the agent.
 */

/** "Een vraag waar de bestelling is", the same for every customer: the log keeps no one's words. */
const QUESTION = "Waar is mijn bestelling?"

interface ThreadRow {
  readonly lastId: string | null
  readonly storeId: string | null
  readonly aside: boolean
  readonly connected: boolean
  readonly answeredByAgent: boolean
}

/** A drafted reply and what it was written from, for the checks it must pass to go alone. */
interface Reply {
  readonly draft: Draft
  readonly facts: string
}

const reply = (task: AgentTask, t: Extract<AgentTask["trigger"], { kind: "thread.received" }>) =>
  Effect.gen(function*() {
    // Where no model is set up (a preview), Insyte writes nothing and the mail is the team's, as before.
    if ((yield* aiMode) === "off") return
    const db = yield* Db
    const [row] = yield* db.scopedFor((sql) =>
      sql<ThreadRow>`
        select (select m.id from email_messages m where m.thread_id = t.id
                order by m.created_at desc, m.id desc limit 1) as last_id,
               c.store_id, t.deleted_at is not null or t.spam_at is not null as aside,
               b.status = 'connected' as connected,
               exists (select 1 from email_messages m join agents a on a.id = m.sent_by
                       where m.thread_id = t.id and m.direction = 'outbound') as answered_by_agent
        from email_threads t join mailboxes b on b.id = t.mailbox_id
        left join customers c on c.id = t.customer_id
        where t.id = ${t.threadId}`
    )
    // The thread binned, its mailbox gone, the team (or the agent) answered since, or a newer mail is its own trigger.
    if (row === undefined || row.aside || !row.connected || row.answeredByAgent || row.lastId !== t.messageId) return
    const agent = yield* agentPrincipal()
    yield* actOnTrigger<Reply, void, unknown, Db | CurrentPrincipal | CurrentWorkspace | Relay>({
      action: "SendReply",
      dedupeKey: `event:${task.eventId}:SendReply:${t.threadId}`,
      storeId: row.storeId,
      subject: { type: "thread", id: t.threadId, label: QUESTION },
      trigger: { kind: "event:thread.received", label: "Nieuwe e-mail" },
      reason: "Een klant vroeg waar de bestelling is; Insyte antwoordde uit de bestelling en de verzending.",
      sentence: "Klant geantwoord op de vraag waar de bestelling is",
      after: "Antwoord ingepland",
      sources: [
        { kind: "thread", title: "Mail van de klant", detail: "Vraagt waar de bestelling is", to: "/inbox" }
      ],
      prepare: Effect.gen(function*() {
        const draft = yield* withAi((ai) =>
          Effect.flatMap(ai.drafts, (d) => d.reply({ subject: { type: "thread", id: t.threadId } }))
        ).pipe(Effect.result)
        if (draft._tag === "Failure") {
          const reason = draft.failure._tag === "BudgetExceeded" ? "budget" : "unknown"
          return { _tag: "Held", reason } satisfies Prepared<Reply> as Prepared<Reply>
        }
        const facts = yield* (yield* Db).scoped((sql) => threadFacts(sql, t.threadId)).pipe(Effect.orDie)
        return {
          _tag: "Ready",
          value: { draft: draft.success, facts: JSON.stringify(facts.context) }
        } satisfies Prepared<Reply> as Prepared<Reply>
      }),
      // What goes without a person promises no money and states no figure it was not given (ai.md §6.2).
      safe: (r) => !promisesMoney(r.draft.text) && untracedFigures(r.draft.text, r.facts).length === 0,
      model: (r) => ({ name: r.draft.model || r.draft.provider, promptVersion: r.draft.promptVersion }),
      run: (r) =>
        Effect.gen(function*() {
          yield* Policy.require("support", 2)
          const hold = yield* UndoWindow
          const outboxId = yield* (yield* Db).scoped((sql) =>
            Effect.gen(function*() {
              const q = yield* replyOn(sql, { threadId: t.threadId, body: r.draft.text })
              yield* Undo.issue(sql, { command: INBOX_RESTORE, compensation: q.compensation, outboxIds: [q.outboxId] })
              yield* sql`update drafts set used_at = coalesce(used_at, now()) where id = ${r.draft.id}`
              return q.outboxId
            })
          )
          yield* (yield* Relay).kick([outboxId], { afterSeconds: hold })
        })
    }).pipe(Effect.provideService(CurrentPrincipal, agent))
  })

const delayed = (task: AgentTask, t: Extract<AgentTask["trigger"], { kind: "order.delayed" }>) =>
  Effect.gen(function*() {
    const db = yield* Db
    const agent = yield* agentPrincipal()
    for (const orderId of t.orderIds) {
      // The plate's own drawing: none for an order already told, without an address, or no longer delayed.
      const draft = yield* db.scopedFor((sql) => draftFor(sql, "order", orderId, `notify_delay:${orderId}`))
      if (draft === null || draft.action._tag !== "NotifyDelayedOrder") continue
      const mail = draft.action
      yield* actOnTrigger({
        action: "SendReply",
        dedupeKey: `event:${task.eventId}:NotifyDelayedOrder:${orderId}`,
        storeId: draft.storeId,
        subject: { type: "order", id: orderId, label: draft.number },
        trigger: { kind: "event:order.delayed", label: "Vertraagde bestelling" },
        reason: "De bestelling is vertraagd en de klant wist het nog niet; Insyte stuurde de vertragingsmail.",
        sentence: `Klant van ${draft.number} ingelicht over de vertraging`,
        before: "Klant nog niet ingelicht",
        after: "Vertragingsmail ingepland",
        sources: [
          { kind: "order", title: `Bestelling ${draft.number}`, detail: "Vertraagd", to: `/orders/${orderId}` }
        ],
        prepare: Effect.succeed({ _tag: "Ready", value: mail } as const),
        safe: () => true,
        model: () => null,
        run: (m) => Effect.asVoid(notifyDelay({ orderId: m.orderId, subject: m.subject, paragraphs: m.paragraphs }))
      }).pipe(Effect.provideService(CurrentPrincipal, agent))
    }
  })

/** One task off the queue, in its workspace; whatever happens is logged and never thrown. */
export const act = (task: AgentTask) =>
  (task.trigger.kind === "thread.received"
    ? reply(task, task.trigger)
    : delayed(task, task.trigger)).pipe(
      Effect.provideService(CurrentWorkspace, { id: task.workspaceId as WorkspaceId }),
      Effect.catchCause((cause) => Effect.logWarning("the agent did not act on a trigger", { cause }))
    )
