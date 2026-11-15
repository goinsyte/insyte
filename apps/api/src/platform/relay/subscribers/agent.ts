import { type AgentTask, asksWhereOrderIs, SYSTEM_SENDER } from "@insyte/modules/agent/domain/Triggers"
import { env } from "cloudflare:workers"
import { Effect } from "effect"
import type { EventsMessage } from "../../Relay.ts"
import { subscriber } from "../Subscriber.ts"

/*
 * The agent sink (M15 step 6; ADR-0027 "started by an event"): what may make the workspace's agent act on its own, put
 * on the events queue as a task, so the model and the use cases run after the event's transaction and hold none of it
 * (`transports/jobs/Queue.ts` → `platform/AgentSink.ts`, loaded there on first use). Here only what is cheap to tell:
 * whether a mail asks where an order is. Whether the agent may act, and what it does, is decided there, every time.
 */

/** Onto the queue; a task that does not get there leaves the trigger to the team, and the event is delivered anyway. */
const ask = (task: AgentTask) =>
  Effect.tryPromise(() => env.EVENTS.send({ agent: task } satisfies EventsMessage)).pipe(
    Effect.catchCause((cause) => Effect.logWarning("an agent task was not put on the queue", { cause }))
  )

export const Agent = subscriber("agent", {
  // A mail in (M11): the agent answers one that asks where an order is, from a customer, never a system's.
  "thread.received": (id, event, sql) =>
    Effect.gen(function*() {
      const [m] = yield* sql<{ subject: string; text: string; sender: string }>`
        select subject, left(body_text, 2000) as text, from_address as sender from email_messages
        where id = ${event.messageId} and direction = 'inbound'`
      if (m === undefined || SYSTEM_SENDER.test(m.sender)) return
      if (!asksWhereOrderIs({ subject: m.subject, text: m.text, reply: event.reply })) return
      yield* ask({
        workspaceId: event.workspaceId,
        eventId: id,
        trigger: { kind: "thread.received", threadId: event.threadId, messageId: event.messageId, reply: event.reply }
      })
    }).pipe(Effect.orDie),
  // An order delayed (M8.4, M10.2): the agent tells its shopper, as the queue's plate would.
  "order.delayed": (id, event) =>
    event.orderIds.length === 0
      ? undefined
      : ask({
        workspaceId: event.workspaceId,
        eventId: id,
        trigger: { kind: "order.delayed", orderIds: event.orderIds }
      })
})
