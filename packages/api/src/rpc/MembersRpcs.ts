import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  InvitationRef,
  InvitationRefs,
  MemberRef,
  SeatLimitReached,
  SendInvitations,
  SetInvitationRole,
  SetLink,
  SetMemberRole,
  Team
} from "@insyte/modules/members/domain/Team"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Instellingen → Team (M3.3–M3.4), for a member of the active workspace: the page, and every action on it, each
 * answering the page as it now stands. Seeing the team is `team` at Bekijken, inviting at Bewerken, managing people at
 * Beheren; the console greys out the same controls from the same catalogue.
 */
export class MembersRpcs extends RpcGroup.make(
  Rpc.make("Team.get", { success: Team, error: Forbidden }),
  Rpc.make("Invitations.send", {
    payload: SendInvitations,
    success: Team,
    error: Schema.Union([Forbidden, Invalid, SeatLimitReached])
  }),
  Rpc.make("Invitations.revoke", { payload: InvitationRefs, success: Team, error: Forbidden }),
  Rpc.make("Invitations.restore", {
    payload: InvitationRef,
    success: Team,
    error: Schema.Union([Forbidden, NotFound, Conflict, SeatLimitReached])
  }),
  Rpc.make("Invitations.resend", { payload: InvitationRef, success: Team, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("Invitations.undoResend", {
    payload: InvitationRef,
    success: Team,
    error: Schema.Union([Forbidden, Conflict])
  }),
  Rpc.make("Invitations.setRole", {
    payload: SetInvitationRole,
    success: Team,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("Members.setRole", {
    payload: SetMemberRole,
    success: Team,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict])
  }),
  Rpc.make("Members.deactivate", {
    payload: MemberRef,
    success: Team,
    error: Schema.Union([Forbidden, NotFound, Conflict, SeatLimitReached])
  }),
  Rpc.make("Members.reactivate", {
    payload: MemberRef,
    success: Team,
    error: Schema.Union([Forbidden, NotFound, Conflict, SeatLimitReached])
  }),
  Rpc.make("Members.remove", {
    payload: MemberRef,
    success: Team,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Members.restore", {
    payload: MemberRef,
    success: Team,
    error: Schema.Union([Forbidden, NotFound, Conflict, SeatLimitReached])
  }),
  Rpc.make("InviteLink.set", { payload: SetLink, success: Team, error: Schema.Union([Forbidden, Invalid]) }),
  Rpc.make("InviteLink.regenerate", { success: Team, error: Schema.Union([Forbidden, Invalid]) }),
  Rpc.make("InviteLink.undoRegenerate", { success: Team, error: Schema.Union([Forbidden, Conflict]) })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
