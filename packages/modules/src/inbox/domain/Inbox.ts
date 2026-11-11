import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Mailboxes, threads and messages as the console, `/v1` and MCP read and change them (M11 steps 1–2; domain.md §6.2,
 * widgets/04 §B). The folders and filters are the design's (`inbox/inbox-search.ts`, `inbox-screen.tsx`). Times are
 * epoch milliseconds. Bodies are the text the mail carried; HTML stays in R2 and is not part of a list.
 */

export const MailboxProvider = Schema.Literals(["forward", "gmail", "outlook"])
export type MailboxProvider = typeof MailboxProvider.Type

export class MailboxView extends Schema.Class<MailboxView>("inbox/MailboxView")({
  id: Schema.String,
  provider: MailboxProvider,
  /** Where the team's mail is addressed: the operator's own support address. */
  address: Schema.String,
  /** The forwarding mailbox's Insyte address, to forward `address` to; `null` for Gmail and Outlook. */
  forwardingAddress: Schema.NullOr(Schema.String),
  label: Schema.String,
  signature: Schema.String,
  isDefault: Schema.Boolean,
  status: Schema.Literals(["connected", "disconnected"]),
  /** The last mail that arrived, or the last sync. */
  lastSyncedAt: Schema.NullOr(Schema.Finite),
  threads: Schema.Int
}) {}

export const Folder = Schema.Literals(["all", "unassigned", "mine", "linked", "archive", "trash", "spam"])
export type Folder = typeof Folder.Type
export const ThreadFilter = Schema.Literals(["unread", "starred", "attachments", "customer"])
export type ThreadFilter = typeof ThreadFilter.Type

export const Address = Schema.Struct({ name: Schema.String, email: Schema.String })
export type Address = typeof Address.Type

export class ThreadRow extends Schema.Class<ThreadRow>("inbox/ThreadRow")({
  id: Schema.String,
  mailboxId: Schema.String,
  subject: Schema.String,
  /** Everyone on the thread; the mailbox's own address is `team`. */
  participants: Schema.Array(Schema.Struct({ name: Schema.String, email: Schema.String, team: Schema.Boolean })),
  lastMessageAt: Schema.Finite,
  preview: Schema.String,
  unread: Schema.Boolean,
  starred: Schema.Boolean,
  labels: Schema.Array(Schema.String),
  assigneeId: Schema.NullOr(Schema.String),
  ticketId: Schema.NullOr(Schema.String),
  customerId: Schema.NullOr(Schema.String),
  hasAttachments: Schema.Boolean,
  hasInbound: Schema.Boolean,
  archivedAt: Schema.NullOr(Schema.Finite),
  snoozedUntil: Schema.NullOr(Schema.Finite),
  spamAt: Schema.NullOr(Schema.Finite),
  deletedAt: Schema.NullOr(Schema.Finite)
}) {}

/** One count per folder, and the threads in the inbox per mailbox, for the area panel. */
export const ThreadCounts = Schema.Struct({
  all: Schema.Int,
  unassigned: Schema.Int,
  mine: Schema.Int,
  linked: Schema.Int,
  archive: Schema.Int,
  trash: Schema.Int,
  spam: Schema.Int,
  byMailbox: Schema.Record(Schema.String, Schema.Int)
})
export type ThreadCounts = typeof ThreadCounts.Type

export const ListInput = Schema.Struct({
  /** Absent: every thread, set aside or not, as the console sorts them into folders itself. */
  folder: Schema.optional(Folder),
  mailboxId: Schema.optional(Schema.String),
  /** Over the subject, the participants and the bodies. */
  q: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  filters: Schema.optional(Schema.Array(ThreadFilter)),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(500)))
})

export class ThreadList extends Schema.Class<ThreadList>("inbox/ThreadList")({
  rows: Schema.Array(ThreadRow),
  counts: ThreadCounts
}) {}

export const SendState = Schema.Literals(["scheduled", "sending", "sent", "failed"])
export type SendState = typeof SendState.Type

export const MessageView = Schema.Struct({
  id: Schema.String,
  direction: Schema.Literals(["inbound", "outbound"]),
  kind: Schema.Literals(["message", "reply", "forward"]),
  from: Address,
  to: Schema.Array(Address),
  cc: Schema.Array(Address),
  subject: Schema.String,
  bodyText: Schema.String,
  /** Whether an HTML body is kept (in R2). */
  hasHtml: Schema.Boolean,
  sentAt: Schema.Finite,
  /** The member who sent it, for what went out. */
  sentBy: Schema.NullOr(Schema.String),
  sendState: Schema.NullOr(SendState),
  sendError: Schema.NullOr(Schema.String),
  attachments: Schema.Array(Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    mime: Schema.String,
    size: Schema.Int
  }))
})
export type MessageView = typeof MessageView.Type

export class ThreadDetail extends Schema.Class<ThreadDetail>("inbox/ThreadDetail")({
  thread: ThreadRow,
  /** Oldest first, as the letter reads. */
  messages: Schema.Array(MessageView)
}) {}

/* ── commands ──────────────────────────────────────────────────────────────────────────────────── */

const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))
const Email = Schema.String.check(Schema.isMaxLength(320), Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
const Body = Schema.String.check(Schema.isMaxLength(100_000))

export const IdsInput = Schema.Struct({ ids: Ids })
export const ReadInput = Schema.Struct({ ids: Ids, read: Schema.Boolean })
export const StarInput = Schema.Struct({ id: Schema.String, starred: Schema.Boolean })
export const SnoozeInput = Schema.Struct({ ids: Ids, until: Schema.Finite })
export const AssignInput = Schema.Struct({ id: Schema.String, memberId: Schema.String })
export const IdInput = Schema.Struct({ id: Schema.String })
export const LabelInput = Schema.Struct({
  id: Schema.String,
  label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60)),
  on: Schema.Boolean
})
/** "Aan ticket koppelen": to a ticket that exists, or a new one made from the thread. */
export const LinkTicketInput = Schema.Struct({ threadId: Schema.String, ticketId: Schema.optional(Schema.String) })
/** Required: an empty one, after trimming, is `Invalid { body: "required" }`. */
export const ReplyInput = Schema.Struct({ threadId: Schema.String, body: Body })
export const ForwardInput = Schema.Struct({
  threadId: Schema.String,
  to: Email,
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(2000)))
})
export const ComposeInput = Schema.Struct({
  /** Absent: the workspace's default mailbox. */
  mailboxId: Schema.optional(Schema.String),
  to: Email,
  subject: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  body: Body
})

export const ConnectInput = Schema.Struct({
  provider: MailboxProvider,
  /** The operator's own support address, which they forward to Insyte (forwarding) or sign in to (Gmail, Outlook). */
  address: Email,
  label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60))
})
export const SignatureInput = Schema.Struct({
  id: Schema.String,
  signature: Schema.String.check(Schema.isMaxLength(2000))
})

export class ThreadChange extends Schema.Class<ThreadChange>("inbox/ThreadChange")({
  threads: Schema.Array(ThreadRow),
  /** `null` where nothing changed. */
  undo: Schema.NullOr(UndoTicket)
}) {}

/** A reply, a forward or a new mail: the thread it is in, the message waiting out the window, and its Undo. */
export class MessageQueued extends Schema.Class<MessageQueued>("inbox/MessageQueued")({
  thread: ThreadRow,
  message: MessageView,
  undo: UndoTicket
}) {}

/** The ticket "Aan ticket koppelen" made or linked, with the thread as it is now. */
export class TicketLinked extends Schema.Class<TicketLinked>("inbox/TicketLinked")({
  thread: ThreadRow,
  ticketId: Schema.String,
  ticketNumber: Schema.Int,
  created: Schema.Boolean,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** A thread's fields as they were, for `Shared.undo`. */
const Before = Schema.Struct({
  id: Schema.String,
  unread: Schema.Boolean,
  starred: Schema.Boolean,
  labels: Schema.Array(Schema.String),
  assigneeId: Schema.NullOr(Schema.String),
  ticketId: Schema.NullOr(Schema.String),
  archivedAt: Schema.NullOr(Schema.Finite),
  snoozedUntil: Schema.NullOr(Schema.Finite),
  spamAt: Schema.NullOr(Schema.Finite),
  deletedAt: Schema.NullOr(Schema.Finite),
  lastMessageAt: Schema.Finite,
  preview: Schema.String
})
export type Before = typeof Before.Type

export const InboxRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("fields"), threads: Schema.Array(Before) }),
  /** A message that never left: taken away, its thread as it was (or taken away too, where the mail started it). */
  Schema.Struct({
    kind: Schema.Literal("unsent"),
    messageId: Schema.String,
    thread: Before,
    removeThread: Schema.Boolean
  }),
  /** A ticket "Aan ticket koppelen" made: unlinked and taken away again. */
  Schema.Struct({ kind: Schema.Literal("linked"), thread: Before, createdTicketId: Schema.NullOr(Schema.String) })
])
export type InboxRestore = typeof InboxRestore.Type

/** A mailbox that is disconnected sends nothing; the console shows its banner. */
export class MailboxDisconnected extends Schema.TaggedError<MailboxDisconnected>()("MailboxDisconnected", {
  mailboxId: Schema.String
}) {}

/** "Nieuwe e-mail" with no mailbox to send it from. */
export class NoMailbox extends Schema.TaggedError<NoMailbox>()("NoMailbox", {}) {}

/** Gmail and Outlook until their OAuth apps are verified and the stage has their keys (M11 step 1b). */
export class ProviderUnavailable extends Schema.TaggedError<ProviderUnavailable>()("ProviderUnavailable", {
  provider: MailboxProvider
}) {}

/* ── what came in ──────────────────────────────────────────────────────────────────────────────── */

/** A mail as the transport parsed it (the `email()` handler, the dev route), before it is a thread's message. */
export interface InboundMail {
  readonly messageId: string | null
  readonly inReplyTo: string | null
  readonly references: ReadonlyArray<string>
  readonly from: Address
  readonly to: ReadonlyArray<Address>
  readonly cc: ReadonlyArray<Address>
  readonly subject: string
  readonly text: string
  readonly html: string | null
  readonly date: Date | null
  readonly attachments: ReadonlyArray<{
    readonly filename: string
    readonly mime: string
    readonly bytes: Uint8Array
    readonly inline: boolean
    readonly contentId: string | null
  }>
}

/** 25 MB per attachment (domain.md §6.2); a larger one is left out and the thread says so. */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024
