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

export const Frame = Schema.Union([Hello, PresenceFrame, RecordsChanged])
export type Frame = typeof Frame.Type
