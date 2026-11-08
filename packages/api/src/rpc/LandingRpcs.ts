import { Accepted, Landing, LandingRef, NotAcceptable } from "@insyte/modules/members/domain/Landing"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Viewer } from "./Viewer.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The invitation landing, `/invitations/<id>` (M3.4). Public: what the link shows, to whoever opened it (signed in or
 * not), and asking for a new invitation or a seat when it no longer lets them in.
 */
export class LandingRpcs extends RpcGroup.make(
  Rpc.make("Landing.resolve", { payload: LandingRef, success: Landing }),
  Rpc.make("Landing.requestNew", { payload: LandingRef, success: Landing }),
  Rpc.make("Landing.requestSeat", { payload: LandingRef, success: Landing })
).middleware(Viewer).middleware(WithDb) {}

/** Accepting or declining from the landing, as the signed-in invitee. `NotAcceptable` names the state instead. */
export class InvitationRpcs extends RpcGroup.make(
  Rpc.make("Landing.accept", { payload: LandingRef, success: Accepted, error: NotAcceptable }),
  Rpc.make("Landing.decline", { payload: LandingRef, success: Landing, error: NotAcceptable })
).middleware(Authenticated).middleware(WithDb) {}
