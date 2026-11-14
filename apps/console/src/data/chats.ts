import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { ChatList, MessagesPage, NotAMember } from "@insyte/modules/chats/domain/Chats"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Chats (M11 step 4): the conversations the member is in, primed by the route's loader; the newest page of the open
 * one; a thread when it opens beside it; who is in it. A `chat.message` frame refetches the list and that conversation
 * (`chatKey`), so every tab in it sees a message, an edit or a card decided; `chat.typing` lands in `typingAtom`.
 */

export const CHATS = ["chats"] as const
/** Every conversation's page and thread, for the realtime socket's catch-up after a gap. */
export const CHAT_PAGES = ["chat-pages"] as const

/** One conversation's reads: its page, its threads, its members. */
export const chatKey = (conversationId: string) => `chat:${conversationId}`

/** As many as the stream draws at once; older pages are not offered yet. */
const PAGE = 100

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
const missing = Schema.Union([
  Forbidden,
  NotFound,
  NotAMember,
  NoWorkspace,
  Unauthenticated,
  RpcClientError.RpcClientError
])

export const chatsAtom = Atom.serializable(
  ConsoleClient.query("Chats.list", undefined, { reactivityKeys: CHATS }),
  { key: "chats", schema: AsyncResult.Schema({ success: ChatList, error: errors }), skipInitialRun: true }
)

export const chatMessagesAtom = Atom.family((conversationId: string) =>
  Atom.serializable(
    ConsoleClient.query("Chats.messages", { conversationId, limit: PAGE }, {
      reactivityKeys: [chatKey(conversationId), ...CHAT_PAGES]
    }),
    {
      key: `chat-messages:${conversationId}`,
      schema: AsyncResult.Schema({ success: MessagesPage, error: missing }),
      skipInitialRun: true
    }
  )
)

/** A thread, by `<conversation>:<message>`, so it reads again with its conversation. */
export const chatThreadAtom = Atom.family((key: string) => {
  const [conversationId = "", messageId = ""] = key.split(":")
  return ConsoleClient.query("Chats.thread", { messageId }, {
    reactivityKeys: [chatKey(conversationId), ...CHAT_PAGES]
  })
})

export const chatMembersAtom = Atom.family((conversationId: string) =>
  ConsoleClient.query("Chats.members", { conversationId }, { reactivityKeys: [chatKey(conversationId)] })
)

/** Who is typing where, as the socket heard it; each entry lapses a few seconds after it came. */
export type Typing = { readonly conversationId: string; readonly principalId: string; readonly at: number }

export const typingAtom = Atom.make<ReadonlyArray<Typing>>([]).pipe(Atom.keepAlive)

/** How long a `chat.typing` frame keeps "{wie} is bezig" up. */
export const TYPING_MS = 4_000

export const chatWrites = {
  send: ConsoleClient.mutation("Chats.send"),
  edit: ConsoleClient.mutation("Chats.editMessage"),
  remove: ConsoleClient.mutation("Chats.deleteMessage"),
  react: ConsoleClient.mutation("Chats.react"),
  pinMessage: ConsoleClient.mutation("Chats.pinMessage"),
  pin: ConsoleClient.mutation("Chats.pin"),
  mute: ConsoleClient.mutation("Chats.mute"),
  markRead: ConsoleClient.mutation("Chats.markRead"),
  typing: ConsoleClient.mutation("Chats.typing"),
  createChannel: ConsoleClient.mutation("Chats.createChannel"),
  openDm: ConsoleClient.mutation("Chats.openDm"),
  openSupplierChannel: ConsoleClient.mutation("Chats.openSupplierChannel"),
  runCommand: ConsoleClient.mutation("Chats.runCommand"),
  confirm: ConsoleClient.mutation("Chats.confirmAction"),
  decline: ConsoleClient.mutation("Chats.declineAction"),
  undoAction: ConsoleClient.mutation("Chats.undoAction"),
  createTicket: ConsoleClient.mutation("Tickets.create"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
