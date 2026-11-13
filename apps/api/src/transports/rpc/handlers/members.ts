import { MembersRpcs } from "@insyte/api/rpc/MembersRpcs"
import { Members } from "@insyte/modules/members/Members"
import { Effect } from "effect"

export const MembersHandlers = MembersRpcs.toLayer(Effect.gen(function*() {
  const members = yield* Members
  return MembersRpcs.of({
    "Team.get": () => members.get,
    "Invitations.send": ({ rows }) => members.send(rows),
    "Invitations.sendSupplier": ({ rows }) => members.sendSupplier(rows),
    "Invitations.supplierAccess": ({ supplierId }) => members.supplierAccess(supplierId),
    "Invitations.revokeSupplier": ({ ids }) => members.revokeSupplier(ids),
    "Invitations.restoreSupplier": ({ id }) => members.restoreSupplier(id),
    "Invitations.revokeContact": ({ id }) => members.revokeContact(id),
    "Invitations.restoreContact": ({ id }) => members.restoreContact(id),
    "Invitations.revoke": ({ ids }) => members.revoke(ids),
    "Invitations.restore": ({ id }) => members.restore(id),
    "Invitations.resend": ({ id }) => members.resend(id),
    "Invitations.undoResend": ({ id }) => members.undoResend(id),
    "Invitations.setRole": ({ id, roleId }) => members.setInvitationRole(id, roleId),
    "Members.setRole": ({ id, roleId }) => members.setMemberRole(id, roleId),
    "Members.deactivate": ({ id }) => members.setDeactivated(id, true),
    "Members.reactivate": ({ id }) => members.setDeactivated(id, false),
    "Members.remove": ({ id }) => members.remove(id),
    "Members.restore": ({ id }) => members.restoreMember(id),
    "InviteLink.set": (patch) => members.setLink(patch),
    "InviteLink.regenerate": () => members.regenerateLink,
    "InviteLink.undoRegenerate": () => members.undoRegenerateLink
  })
}))
