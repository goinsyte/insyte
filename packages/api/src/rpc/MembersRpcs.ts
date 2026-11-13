import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  InvitationRef,
  InvitationRefs,
  MemberRef,
  SeatLimitReached,
  SendInvitations,
  SendSupplierInvitations,
  SetInvitationRole,
  SetLink,
  SetMemberRole,
  SupplierAccess,
  SupplierAccessChanged,
  SupplierInvitationsSent,
  SupplierRef,
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
  // A supplier's person to its portal (M16 step 2): `suppliers` at Beheren; no seat.
  Rpc.make("Invitations.sendSupplier", {
    payload: SendSupplierInvitations,
    success: SupplierInvitationsSent,
    error: Schema.Union([Forbidden, Invalid])
  }),
  // A supplier's portal access from the brand's side (M16): read at `suppliers` Bekijken, changed at Beheren.
  Rpc.make("Invitations.supplierAccess", { payload: SupplierRef, success: SupplierAccess, error: Forbidden }),
  Rpc.make("Invitations.revokeSupplier", { payload: InvitationRefs, success: SupplierAccessChanged, error: Forbidden }),
  Rpc.make("Invitations.restoreSupplier", {
    payload: InvitationRef,
    success: SupplierAccessChanged,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Invitations.revokeContact", {
    payload: InvitationRef,
    success: SupplierAccessChanged,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Invitations.restoreContact", {
    payload: InvitationRef,
    success: SupplierAccessChanged,
    error: Schema.Union([Forbidden, NotFound, Conflict])
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
  Rpc.make("InviteLink.regenerate", { success: Team, error: Forbidden }),
  Rpc.make("InviteLink.undoRegenerate", { success: Team, error: Schema.Union([Forbidden, Conflict]) })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
