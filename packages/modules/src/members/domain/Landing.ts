import { Schema } from "effect"
import { StoreAccess } from "./Team.ts"

/*
 * Where an invitation link lands (M3.4, domain.md §2.5), as the console's landing draws it (`lib/invitations.ts`): the
 * state, and only what the page shows. Never the member list, never anyone's address but the invitee's. Supplier and
 * affiliate invitations join with their portals (M16).
 */

export const LandingState = Schema.Literals([
  "new",
  "existing",
  "other-account",
  "link",
  "sso",
  "full",
  "expired",
  "revoked",
  "accepted",
  "missing"
])
export type LandingState = typeof LandingState.Type

/** The role the invitation grants, as the role card reads it from the catalogue. */
export const LandingRole = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  levels: Schema.Record(Schema.String, Schema.Literals([0, 1, 2, 3])),
  specials: Schema.Record(Schema.String, Schema.Boolean),
  /** Euros, as the catalogue counts them. */
  refundLimit: Schema.NullOr(Schema.Finite)
})
export type LandingRole = typeof LandingRole.Type

export class Landing extends Schema.Class<Landing>("members/Landing")({
  state: LandingState,
  /** `null` only when there is no such invitation. */
  workspace: Schema.NullOr(Schema.String),
  inviter: Schema.NullOr(Schema.Struct({ name: Schema.String, role: Schema.String })),
  /** The invitee; `null` on the shareable link, which is for anyone. */
  email: Schema.NullOr(Schema.String),
  name: Schema.NullOr(Schema.String),
  role: Schema.NullOr(LandingRole),
  stores: StoreAccess,
  message: Schema.NullOr(Schema.String),
  /** Epoch ms: when it lapses (or lapsed); when it was accepted, for `accepted`. */
  at: Schema.NullOr(Schema.Finite),
  /** The address of whoever is signed in, for `other-account`. */
  signedInAs: Schema.NullOr(Schema.String),
  /** The workspace's seats, for `full`. */
  seats: Schema.NullOr(Schema.Int),
  /** The landing already told the inviter: a new invitation or a seat was asked for. */
  requested: Schema.Boolean,
  /** A supplier portal invitation (M16): the supplier it is for; no role, no seat. */
  supplier: Schema.optional(Schema.NullOr(Schema.String))
}) {}

/** An invitation's address: its id (`inv_…`, or `link_<token>` for the shareable link) and, for a person's, its secret. */
export const LandingRef = Schema.Struct({ id: Schema.String, k: Schema.optional(Schema.String) })
export type LandingRef = typeof LandingRef.Type

export class Accepted extends Schema.Class<Accepted>("members/Accepted")({
  workspaceId: Schema.String,
  workspace: Schema.String,
  /** Where the console goes next. */
  landing: Schema.String
}) {}

/** The invitation cannot be accepted as it stands: the landing shows `state` instead. */
export class NotAcceptable extends Schema.TaggedError<NotAcceptable>()("NotAcceptable", { state: LandingState }) {}
