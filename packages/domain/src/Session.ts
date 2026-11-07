import { Context, Schema } from "effect"
import { UserId } from "./Ids.ts"

/*
 * The signed-in person, before any workspace (M2.4). better-auth vouches for the user; which workspace and principal
 * they act as arrives in M3, and `Session.me` grows the principals then.
 */

export const SessionUser = Schema.Struct({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  emailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String)
})
export type SessionUser = typeof SessionUser.Type

/** Provided by the `Authenticated` RPC middleware from the session cookie. */
export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()("domain/CurrentUser") {}

/** What the console needs after sign-in: who, as whom, and where they land (widgets/01). */
export class SessionMe extends Schema.Class<SessionMe>("domain/SessionMe")({
  user: SessionUser,
  /** Every principal the user may act as; empty until the first workspace (M3). */
  principals: Schema.Array(Schema.String),
  activePrincipal: Schema.Null,
  /** `/onboarding` without a workspace; the principal's landing after M3. */
  landing: Schema.String
}) {}
