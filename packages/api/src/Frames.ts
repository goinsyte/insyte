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

export const Frame = Schema.Union([Hello, PresenceFrame, RecordsChanged, NotesChanged, JobProgress])
export type Frame = typeof Frame.Type
