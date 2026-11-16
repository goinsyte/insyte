import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"
import { CHAT_TEXT_MAX, ChatChannelKind } from "./ChatKinds.ts"
import { ThreadRow } from "./Inbox.ts"

/*
 * The website chat (M15 step 8; widgets/04 §B "Websitechat koppelen", the chat letter): a store's chat channel as
 * Instellingen → Koppelingen and the inbox's panel read it, what connecting asks, and what the shopper's widget sends
 * and reads. The widget's shapes are its own (`Widget*`): they carry nothing of the team but the first name a reply was
 * signed with.
 */

/** The welcome text's limit, as the connect dialog's field holds it. */
export const GREETING_MAX = 200
/** The widget's colour: a hex colour, as the theme editor gives it. */
export const Color = Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/))

export class ChannelView extends Schema.Class<ChannelView>("inbox/ChannelView")({
  id: Schema.String,
  kind: ChatChannelKind,
  storeId: Schema.String,
  storeName: Schema.String,
  status: Schema.Literals(["connected", "disconnected"]),
  greeting: Schema.String,
  color: Schema.NullOr(Schema.String),
  /** The chats in the inbox. */
  threads: Schema.Int,
  /** The theme editor's page that turns the app embed on in the store's live theme (Shopify's own deep link). */
  activateUrl: Schema.String,
  connectedAt: Schema.Finite,
  /**
   * Whether Shopify was told where the theme's embed loads the widget from. False on a connected chat: it is on, but
   * the storefront shows nothing until a connect ("Opslaan") gets through.
   */
  themeUpdated: Schema.Boolean
}) {}

/** What Koppelingen and the inbox read: the stores' chat channels, and whether this stage can run the chat at all. */
export class ChannelStatus extends Schema.Class<ChannelStatus>("inbox/ChannelStatus")({
  /** False where the stage has no widget token key yet: connecting is refused until it has one. */
  available: Schema.Boolean,
  channels: Schema.Array(ChannelView)
}) {}

export const ConnectChannelInput = Schema.Struct({
  kind: ChatChannelKind,
  /** The website chat is per store; absent where the workspace has one store. */
  storeId: Schema.optional(Schema.String),
  greeting: Schema.optional(Schema.String.check(Schema.isMaxLength(GREETING_MAX))),
  color: Schema.optional(Color)
})

export const ChannelIdInput = Schema.Struct({ id: Schema.String })

/** A channel connected or disconnected, with the way back. */
export class ChannelChange extends Schema.Class<ChannelChange>("inbox/ChannelChange")({
  channel: ChannelView,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** "Overnemen" and "Teruggeven aan Insyte": the thread as it is now, and its Undo. */
export const ThreadIdInput = Schema.Struct({ threadId: Schema.String })
export class HandoverChange extends Schema.Class<HandoverChange>("inbox/HandoverChange")({
  thread: ThreadRow,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** Versturen, Aanpassen and Weggooien on the customer agent's draft in a chat. */
export const ChatDraftInput = Schema.Struct({ threadId: Schema.String, draftId: Schema.String })

/** The chat as `Shared.undo` puts it back. */
export const ChatRestore = Schema.Union([
  /** A reply still in its undo window: taken away, the thread's preview as it was. */
  Schema.Struct({
    kind: Schema.Literal("unsent"),
    messageId: Schema.String,
    threadId: Schema.String,
    lastMessageAt: Schema.Finite,
    preview: Schema.String,
    /**
     * The reply's own time as Postgres wrote it (its text, to the microsecond), which the thread's `last_message_at`
     * holds while the reply is its last word. Absent from an undo issued before it was kept.
     */
    sentAt: Schema.optional(Schema.String),
    /** The customer agent's draft it sent ("Versturen"): open again once the reply is taken away. */
    draftId: Schema.optional(Schema.String)
  }),
  /** The customer agent's draft, thrown away ("Weggooien"): shown again. */
  Schema.Struct({
    kind: Schema.Literal("draft"),
    threadId: Schema.String,
    draftId: Schema.String
  }),
  /** A take-over or a hand-back: the thread's holder and assignee as they were, the handover's state too. */
  Schema.Struct({
    kind: Schema.Literal("holder"),
    threadId: Schema.String,
    takenOverBy: Schema.NullOr(Schema.String),
    takenOverAt: Schema.NullOr(Schema.Finite),
    handedBackAt: Schema.NullOr(Schema.Finite),
    assigneeId: Schema.NullOr(Schema.String),
    handover: Schema.NullOr(Schema.Struct({
      id: Schema.String,
      pickedUpAt: Schema.NullOr(Schema.Finite),
      pickedUpBy: Schema.NullOr(Schema.String),
      handedBackAt: Schema.NullOr(Schema.Finite),
      handedBackBy: Schema.NullOr(Schema.String)
    }))
  }),
  /** A channel connected (taken away again) or disconnected (back on). */
  Schema.Struct({
    kind: Schema.Literal("channel"),
    channelId: Schema.String,
    /** `null`: it was made by the connect, so Undo removes it (while no chat came in on it). */
    status: Schema.NullOr(Schema.Literals(["connected", "disconnected"])),
    greeting: Schema.String,
    color: Schema.NullOr(Schema.String)
  })
])
export type ChatRestore = typeof ChatRestore.Type

/** The stage has no key to sign widget sessions with (`WEBCHAT_TOKEN_SECRET`), so the chat cannot run here yet. */
export class ChatUnavailable extends Schema.TaggedError<ChatUnavailable>()("ChatUnavailable", {}) {}

/* ── the shopper's widget ──────────────────────────────────────────────────────────────────────── */

/** What the widget says. Plain text: the widget and the inbox both escape it where they show it. */
export const WidgetText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(CHAT_TEXT_MAX))

/** One message as the shopper's widget shows it: theirs, or the store's (the team or the agent alike). */
export const WidgetMessage = Schema.Struct({
  id: Schema.String,
  from: Schema.Literals(["shopper", "store"]),
  text: Schema.String,
  at: Schema.Finite,
  /** The first name a team reply was signed with; absent for the agent's and the shopper's. */
  name: Schema.optional(Schema.String)
})
export type WidgetMessage = typeof WidgetMessage.Type
