import { asksWhereOrderIs, systemSender } from "@insyte/modules/agent/domain/Triggers"
import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { env } from "cloudflare:workers"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { type EventsMessage, keepTask } from "../../Relay.ts"
import { subscriber } from "../Subscriber.ts"
import { agentTaskOf } from "../tasks.ts"

/*
 * The agent sink (M15 step 6; ADR-0027 "started by an event"): what may make the workspace's agent act on its own, put
 * on the events queue as a task, so the model and the use cases run after the event's transaction and hold none of it
 * (`transports/jobs/Queue.ts` → `platform/AgentSink.ts`, loaded there on first use). Here only what is cheap to tell:
 * whether a mail asks where an order is; every website chat message goes. Whether the agent may act, and what it does, is decided there, every time.
 */

/**
 * Kept on the event's transaction (`pending_tasks`, W13.6) and onto the queue: a task that does not get there, or whose
 * message is lost, is sent again by the cron for an hour; after that the trigger is the team's.
 */
const ask = (id: string, event: OutboxEvent, sql: SqlClient.SqlClient) => {
  const task = agentTaskOf(id, event)
  if (task === undefined) return undefined
  return keepTask(sql, task.workspaceId, "agent", id).pipe(
    Effect.orDie,
    Effect.andThen(
      Effect.tryPromise(() => env.EVENTS.send({ agent: task } satisfies EventsMessage)).pipe(
        Effect.catchCause((cause) => Effect.logWarning("an agent task was not put on the queue", { cause }))
      )
    )
  )
}

export const Agent = subscriber("agent", {
  // A mail in (M11): the agent answers one that asks where an order is, from a person, never a system's or a
  // machine's (an out-of-office, a helpdesk's receipt, a list: `automated`), so two machines never answer each other.
  "thread.received": (id, event, sql) =>
    Effect.gen(function*() {
      const [m] = yield* sql<{ subject: string; text: string; sender: string; automated: boolean }>`
        select subject, left(body_text, 2000) as text, from_address as sender, automated from email_messages
        where id = ${event.messageId} and direction = 'inbound'`
      if (m === undefined || m.automated || systemSender(m.sender)) return
      if (!asksWhereOrderIs({ subject: m.subject, text: m.text, reply: event.reply })) return
      yield* ask(id, event, sql) ?? Effect.void
    }).pipe(Effect.orDie),
  // A shopper's message on the website chat (M15 step 8): the customer agent answers it, or hands it to the team.
  "chat.received": (id, event, sql) => ask(id, event, sql),
  // An order delayed (M8.4, M10.2): the agent tells its shopper, as the queue's plate would.
  "order.delayed": (id, event, sql) => ask(id, event, sql)
})
