import { NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import {
  type ChatAuthor,
  ChatChannel,
  type ChatMessage,
  type ChatThread,
  TakenOver,
  ThreadClosed
} from "@insyte/modules/shared/domain/ChatChannel"
import { Effect, Layer } from "effect"

/*
 * The website chat as the customer agent sees it, until the chat itself lands (wave 12: W12.1 builds the real
 * `ChatChannel` over its own tables). This one keeps threads in the isolate's memory, for the worker tests and a local
 * run only: nothing reaches it but the `__dev/chat` routes, and no `chat.received` is written anywhere else, so on a
 * deployed stage the agent never hears a chat until the real one replaces this layer (`platform/CustomerAgent.ts`).
 *
 * It keeps the contract's rules: a thread outside the caller's workspace or stores is `NotFound`; a reply on a thread a
 * person took over is `TakenOver`, on a closed one `ThreadClosed`; the caller's kind is the message's author.
 */

interface Kept {
  thread: ChatThread
  readonly messages: Array<ChatMessage>
  /** A person taking the thread over in the middle of the agent's turn: on its `reads`-th read of the thread from now. */
  takeOverOnRead?: { reads: number; readonly by: string } | undefined
}

const threads = new Map<string, Kept>()

const reach = (threadId: string) =>
  Effect.gen(function*() {
    const p = yield* CurrentPrincipal
    const kept = threads.get(threadId)
    if (
      kept === undefined || kept.thread.workspaceId !== p.workspaceId ||
      (p.storeScope !== null && !p.storeScope.includes(kept.thread.storeId))
    ) {
      return yield* new NotFound({ entity: "chat_thread", id: threadId })
    }
    return kept
  })

const authorOf = (kind: string): ChatAuthor => (kind === "agent" ? "agent" : kind === "member" ? "team" : "system")

export const LocalChat = Layer.succeed(ChatChannel, {
  thread: (threadId) =>
    Effect.map(reach(threadId), (k) => {
      const t = k.takeOverOnRead
      if (t !== undefined && --t.reads <= 0) {
        k.thread = { ...k.thread, takenOverBy: t.by }
        k.takeOverOnRead = undefined
      }
      return { ...k.thread }
    }),
  history: (threadId, { limit }) => Effect.map(reach(threadId), (k) => k.messages.slice(-limit)),
  reply: (threadId, text) =>
    Effect.gen(function*() {
      const k = yield* reach(threadId)
      if (k.thread.closedAt !== null) return yield* new ThreadClosed({ threadId })
      const p = yield* CurrentPrincipal
      if (k.thread.takenOverBy !== null && p.id !== k.thread.takenOverBy) return yield* new TakenOver({ threadId })
      const id = mintId("cmsg")
      k.messages.push({ id, author: authorOf(p.kind), text, at: new Date() })
      return { messageId: id }
    }),
  handOver: (threadId, reason) =>
    Effect.map(reach(threadId), (k) => {
      k.thread = { ...k.thread, handover: { reason, at: new Date() } }
    }),
  bindCustomer: (threadId, customerId) =>
    Effect.map(reach(threadId), (k) => {
      k.thread = { ...k.thread, customerId }
    })
})

/* ── what the `__dev/chat` routes do: a shopper writing, a person taking over ────────────────────────────── */

/** A shopper's message, on a new thread or one of theirs: its ids. */
export const shopperWrites = (
  input: {
    readonly workspaceId: string
    readonly storeId: string
    readonly threadId?: string | undefined
    readonly text: string
  }
) => {
  const threadId = input.threadId ?? mintId("cht")
  const kept = threads.get(threadId) ?? {
    thread: {
      workspaceId: input.workspaceId,
      storeId: input.storeId,
      channel: "webchat",
      customerId: null,
      handover: null,
      takenOverBy: null,
      handedBackAt: null,
      closedAt: null
    },
    messages: []
  }
  threads.set(threadId, kept)
  const messageId = mintId("cmsg")
  kept.messages.push({ id: messageId, author: "shopper", text: input.text, at: new Date() })
  return { threadId, messageId }
}

/** The thread as it stands, with every message: for the tests' eyes only. */
export const threadOf = (workspaceId: string, threadId: string) => {
  const kept = threads.get(threadId)
  return kept === undefined || kept.thread.workspaceId !== workspaceId ? null : kept
}

/**
 * A person taking the thread over (`memberId`) or handing it back (`null`), or closing it; or taking it over on the
 * agent's `reads`-th read of the thread (a person acting while the agent's turn runs).
 */
export const personActs = (
  workspaceId: string,
  threadId: string,
  act: {
    readonly takeOver?: string | null
    readonly close?: boolean
    readonly takeOverOnRead?: { readonly reads: number; readonly by: string }
  }
) => {
  const kept = threadOf(workspaceId, threadId)
  if (kept === null) return false
  if (act.takeOverOnRead !== undefined) kept.takeOverOnRead = { ...act.takeOverOnRead }
  if (act.takeOver !== undefined) {
    kept.thread = {
      ...kept.thread,
      takenOverBy: act.takeOver,
      // Handed back: the agent's again, its handover done.
      handover: act.takeOver === null ? null : kept.thread.handover,
      handedBackAt: act.takeOver === null ? new Date() : kept.thread.handedBackAt
    }
  }
  if (act.close === true) kept.thread = { ...kept.thread, closedAt: new Date() }
  return true
}
