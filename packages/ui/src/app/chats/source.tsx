import { createContext, useContext } from "react"
import type {
  ChatAction,
  ChatCommandId,
  ChatProfile,
  ChatRecordKind,
  ChatRecordRef,
  RichMessage
} from "../../data-source"
import type { Chargeback, Conversation, Currency, Order } from "../lib/types/domain"
import type { Attachment } from "./attachments"
import type { ChatRecord } from "./records"

/**
 * What the chats screen reads and does, from whoever hosts it (as `tickets/source.tsx` is for the tickets screens): the
 * design app from its chat and workspace stores and the fixtures, the console from `Chats.*` (M11 step 4) and each
 * record's own slice. The markup is the design's. What the host cannot do yet is said where the control is
 * ("Binnenkort", or the reason a command cannot run here), never made up: attachments wait for the file store, Insyte in
 * the conversation for M15, a refund, evidence and accepting a dispute for M13. Times are ISO strings.
 */

/** A teammate, as the mention picker and `/toewijzen` know them. */
export type ChatPerson = { id: string; initial: string; name: string }

/** A message as the stream draws it, with what the person did to it since it was posted already applied. */
export type Message = RichMessage & {
  /** Taken back by its author: the stream leaves a gap where it was. */
  deleted?: boolean | undefined
  pinned?: boolean | undefined
  /** It names the person reading it. */
  mentionsMe?: boolean | undefined
  /** The thread under it, as its summary says: how many answered, the last of them, and who. */
  thread?: { count: number; lastAt: string; people: ReadonlyArray<{ id: string; name: string }> } | undefined
}

/** One conversation's stream, oldest first. */
export type ConversationView = {
  messages: ReadonlyArray<Message>
  /** The first message the person had not read when the page opened: where "Nieuw" goes. */
  firstUnread: string | undefined
  /** False while the host is still fetching it; "Nieuw" is placed once it is in. */
  ready: boolean
}

/** Someone in the conversation, for the header's faces and its "In dit gesprek" menu. */
export type Participant = {
  id: string
  name: string
  presence?: ChatProfile["presence"] | undefined
  title?: string | undefined
}

/** Who someone is, for the card on their name: the profile, and what the host knows of their work. */
export type Profile = ChatProfile & {
  /** Their open tickets; absent where the host does not count them. */
  openTickets?: number | undefined
  /** The channels they are in. */
  channels: ReadonlyArray<string>
}

/** A record the `#` picker offers. */
export type RecordHit = Pick<ChatRecord, "ref" | "kind" | "code" | "title">

/** What a record in the side column leads to: an order's chargebacks, a customer's orders, a case's order. */
export type Related = {
  chargebacks: ReadonlyArray<Chargeback>
  orders: ReadonlyArray<Order>
  orderNumber: (orderId: string) => string | undefined
  /** The store's currency, for a customer's total. */
  currency: Currency
}

/** A message from a composer. */
export type Outgoing = {
  body: string
  records: ReadonlyArray<ChatRecordRef>
  attachments: ReadonlyArray<Attachment>
  /** The teammates it names, already read from the text. */
  mentions: ReadonlyArray<ChatPerson>
  /** The message it answers, in a thread. */
  parent: Message | null
  /** A thread's answer that also goes into the channel ("Ook naar #kanaal"). */
  alsoToChannel: boolean
}

/** A command, from the composer's `/` or a verb in the record column: it posts its card and runs as the person. */
export type Run = {
  command: ChatCommandId
  target?: ChatRecordRef | undefined
  arg?: string | undefined
  /** The record it acts on, as the screen resolved it. */
  record: ChatRecord | null
  parent: Message | null
}

/** What `blocked` and `/toewijzen` need from the host: who is on the team, and which commands run here at all. */
export type ChatRules = {
  team: ReadonlyArray<{ id: string; name: string }>
  available: ReadonlySet<ChatCommandId>
}

export interface ChatWrites {
  send: (c: Conversation, message: Outgoing) => void
  run: (c: Conversation, run: Run) => void
  /** A card's "{commando}" or "Goedkeuren": resolves with why it did not run, or nothing. */
  confirm: (a: ChatAction, r: ChatRecord | null) => Promise<string | undefined>
  decline: (a: ChatAction) => void
  /** Whether the card's Ongedaan maken is this tab's to offer (the person ran it, here, a moment ago). */
  canUndo: (a: ChatAction) => boolean
  /** Resolves true once the change is taken back. */
  undo: (a: ChatAction) => Promise<boolean>
  react: (m: Message, emoji: string) => void
  edit: (m: Message, body: string) => void
  remove: (m: Message) => void
  pinMessage: (m: Message) => void
  pin: (c: Conversation, pinned: boolean) => void
  mute: (c: Conversation, muted: boolean) => void
  createChannel: (name: string, topic: string) => void
  /** "Ticket maken van bericht". */
  ticketFrom: (m: Message, c: Conversation) => void
  /** `?id=conv_dm_<member>` for a conversation that is not there yet: the direct thread with them, made once. */
  openDirect: (id: string) => void
  /** The newest message is on screen. */
  markRead: (c: Conversation) => void
  /** A composer's text, kept per conversation (`<id>`) and per thread (`<id>:<message>`). */
  setDraft: (key: string, value: string) => void
}

export interface ChatsSource {
  me: { id: string; name: string; memberId: string }
  conversations: ReadonlyArray<Conversation>
  pinned: ReadonlySet<string>
  muted: ReadonlySet<string>
  /** The header's line under the name; absent, it shows none. */
  describe: (c: Conversation) => string | undefined
  useParticipants: (c: Conversation) => ReadonlyArray<Participant>
  useConversation: (c: Conversation) => ConversationView
  /** A thread's answers, oldest first. */
  useReplies: (parent: Message) => ReadonlyArray<Message>
  /** Who is typing in a composer, for the line above it. */
  useTyping: (key: string) => { id: string; name: string } | undefined
  draft: (key: string) => string
  /** Teammates who can be named with `@`. */
  people: ReadonlyArray<ChatPerson>
  rules: ChatRules
  /** Who sent a message, for the row and the card; never fails, a stranger gets their name. */
  profileOf: (senderId: string, name: string) => ChatProfile
  useProfile: (senderId: string, name: string) => Profile
  /** Someone's direct thread, by its address. */
  dmIdFor: (senderId: string) => string
  useRecord: (ref: ChatRecordRef | undefined) => ChatRecord | null
  useRelated: (r: ChatRecord) => Related
  /** What the `#` picker offers for the typed text; null while it is closed. */
  useRecordSearch: (q: string | null, kinds?: ReadonlyArray<ChatRecordKind>) => ReadonlyArray<RecordHit>
  /** The record a handle in the text names (SO-12224, DSP-2210, #5142), where the host knows it by its handle. */
  refOf: (code: string) => ChatRecordRef | undefined
  /** Every record handle written in a text. */
  refsInText: (text: string) => Array<ChatRecordRef>
  /** Insyte answers in the conversation (`@Insyte`); absent until it does (M15), its controls say "Binnenkort". */
  insyte: boolean
  /** Files can be sent; absent until the file store, the paperclip says "Binnenkort". */
  attachments: boolean
  writes: ChatWrites
}

const Context = createContext<ChatsSource | null>(null)

export const ChatsSourceProvider = Context.Provider

export function useChatsSource(): ChatsSource {
  const source = useContext(Context)
  if (source === null) throw new Error("The chats screen needs a ChatsSourceProvider around it.")
  return source
}

/** What a control the host cannot use yet says, as its title. */
export const SOON = "Binnenkort"
