import type { NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect, Schema } from "effect"

/*
 * The website chat as the rest of Insyte sees it (wave 12: the website chat provides it, the customer agent consumes
 * it). The seam is fixed: the chat's own slice implements this service and emits the event, and a slice that answers
 * shoppers reads and writes a thread only through it.
 *
 * - `chat.received`: a shopper's message was stored, written in the same transaction. Ids only.
 * - `thread`: the thread's standing; `NotFound` outside the caller's workspace or store scope.
 * - `history`: the newest messages, oldest first.
 * - `reply`: a message as the calling principal (a member, or the workspace's `agent`); refused when a person took the
 *   thread over (`TakenOver`) or it is closed (`ThreadClosed`).
 * - `handOver`: the thread needs a person: it shows in the inbox's "Overgedragen" view and the team is told, through
 *   the notifications fan-out with its store fence.
 * - `bindCustomer`: the thread linked to a verified Shopify customer of the same store.
 */

/** The outbox event a shopper's stored message writes (`OutboxEvent`). */
export const ChatReceived = Schema.Struct({
  type: Schema.Literal("chat.received"),
  workspaceId: Schema.String,
  storeId: Schema.String,
  threadId: Schema.String,
  messageId: Schema.String,
  channel: Schema.Literal("webchat")
})
export type ChatReceived = typeof ChatReceived.Type

export type ChatAuthor = "shopper" | "team" | "agent" | "system"

export interface ChatThread {
  readonly workspaceId: string
  readonly storeId: string
  readonly channel: "webchat"
  readonly customerId: string | null
  readonly handover: null | { readonly reason: string; readonly at: Date }
  readonly takenOverBy: string | null
  /** The last time a person handed the thread back to Insyte ("Teruggeven"), or `null` while none has. */
  readonly handedBackAt: Date | null
  readonly closedAt: Date | null
}

export interface ChatMessage {
  readonly id: string
  readonly author: ChatAuthor
  readonly text: string
  readonly at: Date
}

/** A person took the thread over: nobody else replies on it until it is handed back. */
export class TakenOver extends Schema.TaggedError<TakenOver>()("TakenOver", { threadId: Schema.String }) {}

/** The thread is closed: nothing more is sent on it. */
export class ThreadClosed extends Schema.TaggedError<ThreadClosed>()("ThreadClosed", { threadId: Schema.String }) {}

type R = CurrentPrincipal

/**
 * Each call runs as the caller (the agent, or the member who acts); an implementation that needs the database takes it
 * when its layer is built, per invocation, as `LocalChat` is provided in `platform/CustomerAgent.ts`.
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class ChatChannel extends Context.Service<ChatChannel, {
  readonly thread: (threadId: string) => Effect.Effect<ChatThread, NotFound, R>
  readonly history: (
    threadId: string,
    options: { readonly limit: number }
  ) => Effect.Effect<ReadonlyArray<ChatMessage>, NotFound, R>
  readonly reply: (
    threadId: string,
    text: string
  ) => Effect.Effect<{ readonly messageId: string }, NotFound | TakenOver | ThreadClosed, R>
  readonly handOver: (threadId: string, reason: string) => Effect.Effect<void, NotFound, R>
  readonly bindCustomer: (threadId: string, customerId: string) => Effect.Effect<void, NotFound, R>
}>()("shared/ChatChannel") {}
