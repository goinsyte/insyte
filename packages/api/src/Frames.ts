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

/** The first frame on a socket: who else is here, and how long the room has been quiet. */
export const Hello = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("hello"),
  presence: Schema.Array(Present),
  /**
   * Milliseconds since the room last sent a frame a tab refetches on (or may have, when it cannot know). A tab whose
   * page was read before the socket joined compares it with how long it has been loading (`missedBeforeHello`).
   */
  quiet: Schema.optional(Schema.NullOr(Schema.Finite))
})
export type Hello = typeof Hello.Type

/** Slack for the two clocks' ticks (a Worker's moves between events only, a browser's is coarsened). */
const QUIET_SLACK_MS = 1_000

/**
 * Whether a tab's first socket may have missed a frame: its page was read on the server, or by its first queries, at
 * most `loadingFor` ms before the hello came (the document's age, `performance.now()`), and the room sent something
 * since. Durations on either side, so the two clocks need not agree. A hello without a `quiet` (`null`: a room that
 * could not reckon it) cannot say: refetch.
 */
export const missedBeforeHello = (hello: Hello, loadingFor: number): boolean =>
  hello.quiet === undefined || hello.quiet === null || hello.quiet < loadingFor + QUIET_SLACK_MS

/**
 * How long this document has been open, for `missedBeforeHello`: `performance.now()`, or the wall clock since it began
 * where that is more, as on a device that slept, which some browsers leave out of `performance.now()`.
 */
export const documentAge = (): number => Math.max(performance.now(), Date.now() - performance.timeOrigin)

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

/** An uploaded CSV is being read (M14 step 5): `done` of `total` rows in. The hub's import view refetches it. */
export const ImportParseProgress = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("job.progress"),
  kind: Schema.Literal("import_parse"),
  importId: Schema.String,
  done: Schema.Int,
  total: Schema.Int,
  /** Set once the read is over: the import's state now. */
  state: Schema.optional(Schema.Literals(["parsed", "failed"]))
})

/** An export is being written (M14 step 5): `done` of `total` rows (`null` when unknown), or its file ready or failed. */
export const ExportProgress = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("job.progress"),
  kind: Schema.Literal("export"),
  exportId: Schema.String,
  done: Schema.Int,
  total: Schema.NullOr(Schema.Int),
  state: Schema.Literals(["running", "ready", "failed"])
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

/**
 * A sheet changed (M14 step 4): sent to the members who can open it. An open editor at an older version reads it again;
 * the list refetches. Ids and the version only.
 */
export const SheetChanged = Schema.Struct({
  v: Schema.Literal(1),
  type: Schema.Literal("sheet.changed"),
  sheetId: Schema.String,
  version: Schema.Int,
  by: Schema.String
})

export const Frame = Schema.Union([
  Hello,
  PresenceFrame,
  RecordsChanged,
  NotesChanged,
  JobProgress,
  EvidencePackProgress,
  ImportParseProgress,
  ExportProgress,
  ChatMessage,
  ChatTyping,
  LiveVisitors,
  SheetChanged
])
export type Frame = typeof Frame.Type
