import type { AgentTask } from "@insyte/modules/agent/domain/Triggers"
import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import type { EventsMessage } from "../Relay.ts"

/*
 * The task an event asks for, built from the event alone (W13.6): the relay and the agent sink send it, and the cron's
 * sweep (`PendingTasks.ts`) builds it again from the outbox row a `pending_tasks` reference points at, so the table
 * keeps no task and none is too large to keep (a bulk delay names up to 500 orders). Whether the agent should act on
 * a mail is decided before the reference is written; the sweep sends again only what was asked for.
 */

/** The agent's task for an event it acts on (`relay/subscribers/agent.ts`). */
export const agentTaskOf = (eventId: string, event: OutboxEvent): AgentTask | undefined => {
  switch (event.type) {
    case "thread.received":
      return {
        workspaceId: event.workspaceId,
        eventId,
        trigger: { kind: "thread.received", threadId: event.threadId, messageId: event.messageId, reply: event.reply }
      }
    case "chat.received":
      return {
        workspaceId: event.workspaceId,
        eventId,
        trigger: {
          kind: "chat.received",
          storeId: event.storeId,
          threadId: event.threadId,
          messageId: event.messageId,
          channel: event.channel
        }
      }
    case "order.delayed":
      return event.orderIds.length === 0
        ? undefined
        : { workspaceId: event.workspaceId, eventId, trigger: { kind: "order.delayed", orderIds: event.orderIds } }
    default:
      return undefined
  }
}

export type PendingKind = "agent" | "classify_ticket" | "embed_knowledge"

/** The queue's message for a kept task of `kind`, from its event; `undefined` when the event asks for none. */
export const taskOf = (kind: PendingKind, eventId: string, event: OutboxEvent): EventsMessage | undefined => {
  if (kind === "agent") {
    const agent = agentTaskOf(eventId, event)
    return agent === undefined ? undefined : { agent }
  }
  if (kind === "classify_ticket" && event.type === "ticket.topic_requested") {
    return { classifyTicket: { workspaceId: event.workspaceId, ticketId: event.ticketId, eventId } }
  }
  if (kind === "embed_knowledge" && event.type === "knowledge.published") {
    const { workspaceId, articleId, version } = event
    return { embedKnowledge: { workspaceId, articleId, version, eventId } }
  }
  return undefined
}
