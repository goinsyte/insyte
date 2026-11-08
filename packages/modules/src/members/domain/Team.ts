import { Schema } from "effect"

/*
 * The team page's facts (M3.3–M3.4), as the console's team store holds them: who is in, who has been asked, the seats
 * on the plan, and the shareable link. Times are epoch milliseconds, as the store keeps them. Every write answers the
 * whole `Team`, so the page shows what the server holds without a second read.
 */

/** Every store, or these. A member's stores narrow their role's, never widen them. */
export const StoreAccess = Schema.Union([Schema.Literal("all"), Schema.Array(Schema.String)])
export type StoreAccess = typeof StoreAccess.Type

export class TeamMember extends Schema.Class<TeamMember>("members/TeamMember")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  roleId: Schema.String,
  roleLabel: Schema.String,
  stores: StoreAccess,
  /** The member who brought them in; `null` for the founder. */
  invitedBy: Schema.NullOr(Schema.String),
  joinedAt: Schema.Finite,
  lastActiveAt: Schema.NullOr(Schema.Finite),
  deactivated: Schema.Boolean
}) {}

export class PendingInvitation extends Schema.Class<PendingInvitation>("members/PendingInvitation")({
  id: Schema.String,
  email: Schema.String,
  roleId: Schema.String,
  stores: StoreAccess,
  message: Schema.NullOr(Schema.String),
  invitedBy: Schema.String,
  sentAt: Schema.Finite,
  expiresAt: Schema.Finite,
  /** How many times it was sent again. */
  resent: Schema.Int,
  /** Its link, for "Link kopiëren": only for whoever may invite. */
  url: Schema.NullOr(Schema.String)
}) {}

/** Active people plus open invitations take a seat; a lapsed invitation does not. */
export class Seats extends Schema.Class<Seats>("members/Seats")({
  total: Schema.Int,
  used: Schema.Int,
  active: Schema.Int,
  pending: Schema.Int,
  free: Schema.Int,
  full: Schema.Boolean
}) {}

export const LinkDays = Schema.Literals([1, 7, 30])
export type LinkDays = typeof LinkDays.Type

export class InviteLink extends Schema.Class<InviteLink>("members/InviteLink")({
  enabled: Schema.Boolean,
  /** The link's own part, `link_<token>` in the landing's address; `null` until the link is first made. */
  token: Schema.NullOr(Schema.String),
  roleId: Schema.String,
  days: LinkDays,
  createdAt: Schema.Finite,
  expiresAt: Schema.Finite,
  joined: Schema.Int,
  /** The address to pass on: only for whoever may invite, and only once the link exists. */
  url: Schema.NullOr(Schema.String)
}) {}

/** A role of the workspace, as the pickers and the sentences under them read it (the catalogue's `RoleDef`). */
export class TeamRole extends Schema.Class<TeamRole>("members/TeamRole")({
  id: Schema.String,
  label: Schema.String,
  system: Schema.Boolean,
  levels: Schema.Record(Schema.String, Schema.Literals([0, 1, 2, 3])),
  specials: Schema.Record(Schema.String, Schema.Boolean),
  /** Euros, as the catalogue counts them. */
  refundLimit: Schema.NullOr(Schema.Finite),
  stores: StoreAccess
}) {}

export class Team extends Schema.Class<Team>("members/Team")({
  /** The signed-in person's own member id. */
  me: Schema.String,
  members: Schema.Array(TeamMember),
  invitations: Schema.Array(PendingInvitation),
  seats: Seats,
  link: InviteLink,
  /** Every role of the workspace, the owner's first. */
  roles: Schema.Array(TeamRole)
}) {}

/* ── writes ────────────────────────────────────────────────────────────────────────────────────── */

export const InviteRow = Schema.Struct({
  email: Schema.String,
  roleId: Schema.String,
  stores: StoreAccess,
  message: Schema.optional(Schema.String)
})
export type InviteRow = typeof InviteRow.Type

export const SendInvitations = Schema.Struct({ rows: Schema.Array(InviteRow).check(Schema.isMinLength(1)) })
export const InvitationRef = Schema.Struct({ id: Schema.String })
export const InvitationRefs = Schema.Struct({ ids: Schema.Array(Schema.String) })
export const SetInvitationRole = Schema.Struct({ id: Schema.String, roleId: Schema.String })
export const MemberRef = Schema.Struct({ id: Schema.String })
export const SetMemberRole = Schema.Struct({ id: Schema.String, roleId: Schema.String })
export const SetLink = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  roleId: Schema.optional(Schema.String),
  days: Schema.optional(LinkDays)
})
export type SetLink = typeof SetLink.Type

/* ── refusals ──────────────────────────────────────────────────────────────────────────────────── */

/** More invitations than free seats: the console offers the seats page. */
export class SeatLimitReached extends Schema.TaggedError<SeatLimitReached>()("SeatLimitReached", {
  total: Schema.Int,
  free: Schema.Int
}) {}
