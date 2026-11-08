import { AREA_IDS } from "@insyte/domain/Permissions"
import { Schema } from "effect"

/*
 * Asking for access (M3.5, domain.md §2.6): a member asks for an area at a level from a denied state; whoever may
 * manage the team grants it (the area goes up on the asker's role, for everyone holding it) or declines. Times are
 * epoch milliseconds, as the console keeps them.
 */

export const AccessArea = Schema.Literals(AREA_IDS)
export const AccessLevel = Schema.Literals([1, 2, 3])
export const AccessState = Schema.Literals(["open", "granted", "declined", "withdrawn"])
export type AccessState = typeof AccessState.Type

export class AccessRequest extends Schema.Class<AccessRequest>("access/AccessRequest")({
  id: Schema.String,
  memberId: Schema.String,
  memberName: Schema.String,
  roleId: Schema.String,
  roleLabel: Schema.String,
  area: AccessArea,
  level: AccessLevel,
  /** The page it was asked from. */
  path: Schema.NullOr(Schema.String),
  state: AccessState,
  decidedBy: Schema.NullOr(Schema.String),
  decidedAt: Schema.NullOr(Schema.Finite),
  createdAt: Schema.Finite
}) {}

export const RequestAccess = Schema.Struct({
  area: AccessArea,
  level: AccessLevel,
  path: Schema.optional(Schema.String)
})
export type RequestAccess = typeof RequestAccess.Type

export const AccessRef = Schema.Struct({ id: Schema.String })

/** The role already has it: nothing to ask. */
export class AlreadyAllowed extends Schema.TaggedError<AlreadyAllowed>()("AlreadyAllowed", {
  area: AccessArea,
  level: AccessLevel
}) {}
