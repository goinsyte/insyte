import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Chats as the console reads and changes them (M11 step 4; domain.md §7, §7.1; widgets/04 §C). The vocabularies are the
 * design's (`data-source/types.ts`: `ChatRecordRef`, `ChatCommandId`, `ChatAction`). Times are epoch milliseconds. A
 * conversation is a channel (the team's), a DM (two members) or the shared channel with a supplier; a message's
 * records are references the console draws as live cards through each record's own slice.
 */

export const ConversationKind = Schema.Literals(["channel", "dm", "supplier_channel"])
export type ConversationKind = typeof ConversationKind.Type

/** What a message can carry as a live card, as the design's `#` picker shares it. */
export const RecordKind = Schema.Literals(["order", "customer", "product", "chargeback", "ticket"])
export type RecordKind = typeof RecordKind.Type
export const RecordRef = Schema.Struct({ kind: RecordKind, id: Schema.String.check(Schema.isMaxLength(64)) })
export type RecordRef = typeof RecordRef.Type

/** The app actions a conversation can run (`/terugbetalen` … `/accepteren`), by their design ids. */
export const CommandId = Schema.Literals([
  "refund",
  "cancel",
  "note",
  "ticket",
  "assign",
  "status",
  "evidence",
  "accept"
])
export type CommandId = typeof CommandId.Type
export const ActionState = Schema.Literals(["confirm", "proposed", "running", "done", "undone", "declined", "failed"])
export type ActionState = typeof ActionState.Type

/** A money or irreversible command: it posts its card in `confirm` and runs only on a confirm, with no Undo. */
export const CONFIRMED: ReadonlySet<CommandId> = new Set(["refund", "cancel", "evidence", "accept"])

export const Person = Schema.Struct({ id: Schema.String, name: Schema.String })
export type Person = typeof Person.Type

export const Author = Schema.Struct({
  kind: Schema.Literals(["member", "supplier", "insyte", "system"]),
  id: Schema.String,
  name: Schema.String
})

export class ConversationRow extends Schema.Class<ConversationRow>("chats/ConversationRow")({
  id: Schema.String,
  kind: ConversationKind,
  /** A channel's name without `#`; a DM's is the other person's name. */
  name: Schema.String,
  topic: Schema.String,
  supplierId: Schema.NullOr(Schema.String),
  /** For a DM: the other member, for "Bericht" and their profile. */
  dmMemberId: Schema.NullOr(Schema.String),
  memberCount: Schema.Int,
  /** Messages since the person last read it, not their own. */
  unread: Schema.Int,
  lastMessageAt: Schema.NullOr(Schema.Finite),
  /** The newest message's first words, for the panel. */
  preview: Schema.String,
  pinned: Schema.Boolean,
  muted: Schema.Boolean,
  createdAt: Schema.Finite
}) {}

export const Reaction = Schema.Struct({ emoji: Schema.String, count: Schema.Int, mine: Schema.Boolean })

export const ActionView = Schema.Struct({
  id: Schema.String,
  command: CommandId,
  target: Schema.NullOr(RecordRef),
  arg: Schema.NullOr(Schema.String),
  by: Schema.Literals(["person", "insyte"]),
  state: ActionState,
  /** Who ran it. */
  createdBy: Schema.String,
  /** Who confirmed or declined it, when it was not who started it. */
  decidedBy: Schema.NullOr(Person),
  undoUntil: Schema.NullOr(Schema.Finite),
  /** Why it did not run, in the words the card's footer shows. */
  error: Schema.NullOr(Schema.String)
})
export type ActionView = typeof ActionView.Type

export class MessageRow extends Schema.Class<MessageRow>("chats/MessageRow")({
  id: Schema.String,
  conversationId: Schema.String,
  author: Author,
  /** Empty once the author took it back (`deleted`). */
  body: Schema.String,
  mentions: Schema.Array(Schema.String),
  records: Schema.Array(RecordRef),
  action: Schema.NullOr(ActionView),
  reactions: Schema.Array(Reaction),
  replyTo: Schema.NullOr(Schema.String),
  alsoInChannel: Schema.Boolean,
  replyCount: Schema.Int,
  lastReplyAt: Schema.NullOr(Schema.Finite),
  /** Up to three who answered in its thread, the newest first. */
  replyAuthors: Schema.Array(Person),
  pinnedAt: Schema.NullOr(Schema.Finite),
  editedAt: Schema.NullOr(Schema.Finite),
  deleted: Schema.Boolean,
  createdAt: Schema.Finite
}) {}

export class ChatList extends Schema.Class<ChatList>("chats/ChatList")({
  conversations: Schema.Array(ConversationRow)
}) {}

export class MessagesPage extends Schema.Class<MessagesPage>("chats/MessagesPage")({
  conversation: ConversationRow,
  /** Oldest first, as the stream draws them; the top level only (a thread's replies are `Chats.thread`). */
  messages: Schema.Array(MessageRow),
  /** Pass as `before` for the page above; `null` at the start of the conversation. */
  before: Schema.NullOr(Schema.String),
  /** When the person last read it before this page, for the "Nieuw" divider. */
  lastReadAt: Schema.NullOr(Schema.Finite)
}) {}

export class ChatThread extends Schema.Class<ChatThread>("chats/ChatThread")({
  parent: MessageRow,
  replies: Schema.Array(MessageRow)
}) {}

export const ChatMember = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["member", "supplier", "insyte"]),
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
  /** The member's role, as the "In dit gesprek" menu titles them. */
  title: Schema.String
})

export class ChatMembers extends Schema.Class<ChatMembers>("chats/ChatMembers")({
  members: Schema.Array(ChatMember)
}) {}

/** What a write answered: the message as it is now, and its undo where it has one. */
export class MessageChange extends Schema.Class<MessageChange>("chats/MessageChange")({
  message: MessageRow,
  undo: Schema.NullOr(UndoTicket)
}) {}

export class ConversationChange extends Schema.Class<ConversationChange>("chats/ConversationChange")({
  conversation: ConversationRow,
  undo: Schema.NullOr(UndoTicket)
}) {}

const Body = Schema.String.check(Schema.isMaxLength(10_000))
const Id = Schema.String.check(Schema.isMaxLength(64))

export const ConversationIdInput = Schema.Struct({ conversationId: Id })
export const MessageIdInput = Schema.Struct({ messageId: Id })
export const ActionIdInput = Schema.Struct({ actionId: Id })
export const MessagesInput = Schema.Struct({
  conversationId: Id,
  before: Schema.optional(Id),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })))
})
export const SendInput = Schema.Struct({
  conversationId: Id,
  body: Body,
  mentions: Schema.optional(Schema.Array(Id).check(Schema.isMaxLength(50))),
  records: Schema.optional(Schema.Array(RecordRef).check(Schema.isMaxLength(10))),
  replyTo: Schema.optional(Id),
  /** A thread's answer that also goes into the conversation ("Ook in kanaal"). */
  alsoToChannel: Schema.optional(Schema.Boolean)
})
export const EditInput = Schema.Struct({ messageId: Id, body: Body })
export const ReactInput = Schema.Struct({
  messageId: Id,
  emoji: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  on: Schema.Boolean
})
export const PinMessageInput = Schema.Struct({ messageId: Id, pinned: Schema.Boolean })
export const PinInput = Schema.Struct({ conversationId: Id, pinned: Schema.Boolean })
export const MuteInput = Schema.Struct({ conversationId: Id, muted: Schema.Boolean })
export const CreateChannelInput = Schema.Struct({
  name: Schema.String.check(Schema.isMaxLength(80)),
  topic: Schema.optional(Schema.String.check(Schema.isMaxLength(500)))
})
export const OpenDmInput = Schema.Struct({ memberId: Id })
export const OpenSupplierInput = Schema.Struct({ supplierId: Id })
export const RunCommandInput = Schema.Struct({
  conversationId: Id,
  command: CommandId,
  target: Schema.optional(RecordRef),
  arg: Schema.optional(Schema.String.check(Schema.isMaxLength(2000))),
  replyTo: Schema.optional(Id)
})

/** Not in the conversation: a DM between two others, or an archived channel. */
export class NotAMember extends Schema.TaggedError<NotAMember>()("NotAMember", { conversationId: Schema.String }) {}

/** A message with no text and no records. */
export class EmptyMessage extends Schema.TaggedError<EmptyMessage>()("EmptyMessage", {}) {}

/** A channel by that name is there already ("#slug bestaat al."). */
export class NameTaken extends Schema.TaggedError<NameTaken>()("NameTaken", { name: Schema.String }) {}

/**
 * A command that cannot run as asked, with the design's reasons (`commands.ts` `blocked`): not available here yet, the
 * record of the wrong kind, a note or a person or a status missing, or the card already decided.
 */
export class CommandRefused extends Schema.TaggedError<CommandRefused>()("CommandRefused", {
  reason: Schema.Literals([
    "unavailable",
    "wrong_kind",
    "target_required",
    "note_required",
    "unknown_member",
    "unknown_status",
    "decided"
  ])
}) {}

/** What `Shared.undo` puts back for `chats.restore`. */
export const ChatsRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("message_deleted"), id: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("channel_created"), id: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("channel_archived"), id: Schema.String }),
  /** A command that ran: its own undo, by its token's hash (`Undo.hashOf`), and the card marked undone. */
  Schema.Struct({ kind: Schema.Literal("action"), id: Schema.String, innerHash: Schema.String })
])
export type ChatsRestore = typeof ChatsRestore.Type
