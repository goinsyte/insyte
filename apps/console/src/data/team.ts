import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { Team } from "@insyte/modules/members/domain/Team"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Instellingen → Team (M3.3–M3.4): the page as one read, primed by the route's loader on the server and carried in the
 * document (as `startAtom`), and every action on it as a mutation naming `TEAM`, so the page reads again after each.
 */

export const TEAM = ["team"] as const

export const teamAtom = Atom.serializable(
  ConsoleClient.query("Team.get", undefined, { reactivityKeys: TEAM }),
  {
    key: "team",
    schema: AsyncResult.Schema({
      success: Team,
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const teamWrites = {
  send: ConsoleClient.mutation("Invitations.send"),
  revoke: ConsoleClient.mutation("Invitations.revoke"),
  restore: ConsoleClient.mutation("Invitations.restore"),
  resend: ConsoleClient.mutation("Invitations.resend"),
  undoResend: ConsoleClient.mutation("Invitations.undoResend"),
  setInvitationRole: ConsoleClient.mutation("Invitations.setRole"),
  setMemberRole: ConsoleClient.mutation("Members.setRole"),
  setMemberStores: ConsoleClient.mutation("Members.setStores"),
  deactivate: ConsoleClient.mutation("Members.deactivate"),
  reactivate: ConsoleClient.mutation("Members.reactivate"),
  remove: ConsoleClient.mutation("Members.remove"),
  restoreMember: ConsoleClient.mutation("Members.restore"),
  setLink: ConsoleClient.mutation("InviteLink.set"),
  regenerateLink: ConsoleClient.mutation("InviteLink.regenerate"),
  undoRegenerateLink: ConsoleClient.mutation("InviteLink.undoRegenerate")
} as const
