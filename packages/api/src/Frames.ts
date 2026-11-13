import { LiveEvent, LiveVisitor } from "@insyte/modules/live/domain/Live"
import { Schema } from "effect"

/*
 * What the realtime socket sends (M5.1, ADR-0013): push-only, server to client, versioned. Frames carry ids and enums,
 * never a record's contents: `records.changed` makes the console refetch through RPC, where the permission check runs,
 * so a frame can never show someone a record they could not open.
 */

/** Who is in the room: one entry per member with at least one open tab. */
export const Present = Schema.Struct({
  memberId: Schema.String,
  /** When their first open tab joined. */
  since: Schema.Finite
})
export type Present = typeof Present.Type

/** The first frame on a socket: who else is here. */
export const Hello = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("hello"),
  presence: Schema.Array(Present)
})

/** Someone's presence changed: their first tab opened, or their last one closed. */
export const PresenceFrame = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("presence"),
  presence: Schema.Array(Present)
})

/**
 * Records of one kind changed: the console refetches what it shows of that kind. The kinds grow with the slices:
 * `member`, `invitation`, `role`, `access_request`, `api_key` now; `order`, `ticket`, … as they land.
 */
export const RecordsChanged = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("records.changed"),
  kind: Schema.String,
  ids: Schema.Array(Schema.String)
})
export type RecordsChanged = typeof RecordsChanged.Type

/** The member's notifications changed: sent to that member's tabs only, with their unread count for the bell. */
export const NotesChanged = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("notes.changed"),
  unread: Schema.Int
})

/**
 * A long job moved on (M6.3): a store's first import, page by page, with the mirror's counts so far. The onboarding's
 * sync step and Winkels draw it; the counts are figures, not records.
 */
export const JobProgress = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("job.progress"),
  kind: Schema.Literal("store_backfill"),
  storeId: Schema.String,
  /** The resource being read now, or `done` once the import is in. */
  label: Schema.Literals(["products", "customers", "orders", "done"]),
  counts: Schema.Struct({ products: Schema.Int, customers: Schema.Int, orders: Schema.Int })
})
export type JobProgress = typeof JobProgress.Type

/** A case's evidence pack moved on (M13 step 4): `done` of `total` documents in. The case's page refetches it. */
export const EvidencePackProgress = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("job.progress"),
  kind: Schema.Literal("evidence_pack"),
  chargebackId: Schema.String,
  done: Schema.Int,
  total: Schema.Int
})

/**
 * A chat message posted, or changed (edited, taken back, pinned, reacted to, its card decided) (M11.4): the tabs refetch
 * that conversation and the panel's counts. Ids only, as every frame: a channel's go to the room, a DM's to its two.
 */
export const ChatMessage = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literals(["chat.message", "chat.message.updated"]),
  conversationId: Schema.String,
  messageId: Schema.String,
  authorId: Schema.String
})

/** Someone is typing in a conversation ("{wie} is bezig"): not stored, raised by `Chats.typing`. */
export const ChatTyping = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("chat.typing"),
  conversationId: Schema.String,
  principalId: Schema.String
})

/**
 * Who is on the store now (M14 step 3), from the workspace's live room, at most every 500 ms, to the tabs that hold a
 * `Live.subscribe` lease. ADR-0013's one exception: it carries content, anonymised visitor sessions (a hashed id, a
 * city and country, a page title, a source), never personal data and never stored.
 */
export const LiveVisitors = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("live.visitors"),
  upserts: Schema.Array(LiveVisitor),
  removed: Schema.Array(Schema.String),
  events: Schema.Array(LiveEvent)
})
export type LiveVisitors = typeof LiveVisitors.Type

export const Frame = Schema.Union([
  Hello,
  PresenceFrame,
  RecordsChanged,
  NotesChanged,
  JobProgress,
  EvidencePackProgress,
  ChatMessage,
  ChatTyping,
  LiveVisitors
])
export type Frame = typeof Frame.Type
