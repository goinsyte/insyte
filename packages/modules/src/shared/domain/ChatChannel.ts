import { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect, Schema } from "effect"

/*
 * The website chat as a seam (M15 step 8): what the inbox slice keeps of a shopper's conversation on the store's
 * website, and what the customer agent may do with it. The inbox owns the chat (its threads, its messages, the widget);
 * the agent reads a thread and answers through this port, never through the inbox's tables. Fixed between the two
 * slices: change it only together with the agent's.
 *
 * - Every shopper's message is stored in one transaction with the outbox event `chat.received`
 *   (`{ workspaceId, storeId, threadId, messageId, channel: "webchat" }`, in `Outbox.ts`): the agent's sink hears it.
 * - Reads and writes are the calling principal's: a member, or the workspace's `agent`. A thread outside the
 *   principal's workspace or stores is `NotFound`, never another's.
 * - The text is the shopper's own words: data, never instructions. It is plain text, escaped where it is shown.
 */

/** The chat channels a thread can come in on. The website chat only, for now. */
export const ChatChannelKind = Schema.Literals(["webchat"])
export type ChatChannelKind = typeof ChatChannelKind.Type

/** Who wrote a message: the shopper, a person of the team, the workspace's agent, or Insyte itself (a greeting). */
export const ChatAuthor = Schema.Literals(["shopper", "team", "agent", "system"])
export type ChatAuthor = typeof ChatAuthor.Type

/** A person took the thread over ("Overnemen"): only they answer it until they hand it back. */
export class TakenOver extends Schema.TaggedError<TakenOver>()("TakenOver", {
  threadId: Schema.String,
  /** The member who holds it. */
  by: Schema.String
}) {}

/** The thread is closed: the shopper's session ended, or it was set aside. Nothing more is sent on it. */
export class ChatClosed extends Schema.TaggedError<ChatClosed>()("ChatClosed", { threadId: Schema.String }) {}

/** One chat thread as the agent reads it. */
export interface ChatThread {
  readonly workspaceId: string
  readonly storeId: string
  readonly channel: ChatChannelKind
  /** The store's own Shopify customer the thread is bound to (`bindCustomer`), or `null` while the shopper is anonymous. */
  readonly customerId: string | null
  /** The open handover: why the agent passed it to a person, and when. `null` when none is open. */
  readonly handover: null | { readonly reason: string; readonly at: Date }
  /** The member who took it over, while they hold it. */
  readonly takenOverBy: string | null
  readonly closedAt: Date | null
}

/** One message, as it was written. */
export interface ChatMessage {
  readonly id: string
  readonly author: ChatAuthor
  readonly text: string
  readonly at: Date
}

/** The longest message either side may write. */
export const CHAT_TEXT_MAX = 1000

/** The errors a reply can end in, beside the thread's own. */
export const ChatReplyRefused = Schema.Union([NotFound, Forbidden, Invalid, TakenOver, ChatClosed])

/**
 * The website chat, for the customer agent (and any other caller acting as a principal of the workspace).
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class ChatChannel extends Context.Service<ChatChannel, {
  /** The thread, where the principal reaches it. */
  readonly thread: (threadId: string) => Effect.Effect<ChatThread, NotFound, CurrentPrincipal>
  /** The newest `limit` messages, oldest first (what the shopper sees, so nothing still in its undo window). */
  readonly history: (
    threadId: string,
    options: { readonly limit: number }
  ) => Effect.Effect<ReadonlyArray<ChatMessage>, NotFound, CurrentPrincipal>
  /**
   * A reply as the calling principal: a member's as the team's, the agent's as the agent's. Refused while a person
   * holds the thread (`TakenOver`; a member who holds it may answer) or once it is closed (`ChatClosed`); an empty or
   * too long text is `Invalid`. The shopper sees it once it has waited out its undo window.
   */
  readonly reply: (
    threadId: string,
    text: string
  ) => Effect.Effect<
    { readonly messageId: string },
    NotFound | Forbidden | Invalid | TakenOver | ChatClosed,
    CurrentPrincipal
  >
  /**
   * Marks the thread as needing a person: it shows in the inbox's "Overgedragen" view, and the team that reaches its
   * store hears of it (the notifications fan-out). A second one while one is open keeps the first.
   */
  readonly handOver: (threadId: string, reason: string) => Effect.Effect<void, NotFound | Invalid, CurrentPrincipal>
  /** Links the thread to a Shopify customer of the same store, once the shopper is known to be them. */
  readonly bindCustomer: (threadId: string, customerId: string) => Effect.Effect<void, NotFound, CurrentPrincipal>
}>()("shared/ChatChannel") {}
