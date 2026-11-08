import { Schema } from "effect"

/*
 * The errors every slice shares (04 §3). They carry tags and fields, never Dutch copy: the console owns the sentence.
 * A slice adds its own (`RefundOverLimit`, `SeatLimitReached`) and lists each in its RPC's error union.
 */

/** The one policy refusal. Renders "Je rol Support mist Bestellingen · Bewerken". */
export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
  permission: Schema.String,
  level: Schema.Int,
  roleLabel: Schema.String
}) {}

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  entity: Schema.String,
  id: Schema.String
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", {
  entity: Schema.String,
  /** A machine reason: `stale_version`, `already_refunded`. */
  reason: Schema.String
}) {}

/** Field-level validation the server owns (uniqueness, cross-record rules), field name → reason code. */
export class Invalid extends Schema.TaggedError<Invalid>()("Invalid", {
  fields: Schema.Record(Schema.String, Schema.String)
}) {}

export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()("Unauthenticated", {}) {}

/** Signed in, but a member of no workspace yet: the console sends them to onboarding. */
export class NoWorkspace extends Schema.TaggedError<NoWorkspace>()("NoWorkspace", {}) {}
