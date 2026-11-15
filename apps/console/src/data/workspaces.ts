import { ConsoleClient } from "./client.ts"

/*
 * The person's workspaces (M3.1, M3.4): the switcher's list and the invitations to another workspace, read in the
 * browser once the frame is up (the frame paints the active workspace from `Shell.frame` until then), and what is done
 * with them. Each write names `WORKSPACES`, so the switcher reads again. A switch, a new workspace and leaving one load
 * the page afresh instead (`switching.ts`): nothing read in one workspace stays on screen in another.
 */

export const WORKSPACES = ["workspaces"] as const

export const workspacesAtom = ConsoleClient.query("Workspaces.list", undefined, { reactivityKeys: WORKSPACES })

export const workspaceInvitesAtom = ConsoleClient.query("Workspaces.listInvites", undefined, {
  reactivityKeys: WORKSPACES
})

export const workspaceWrites = {
  create: ConsoleClient.mutation("Workspaces.create"),
  switch: ConsoleClient.mutation("Workspaces.switch"),
  leave: ConsoleClient.mutation("Workspaces.leave"),
  acceptInvite: ConsoleClient.mutation("Workspaces.acceptInvite"),
  declineInvite: ConsoleClient.mutation("Workspaces.declineInvite"),
  restoreInvite: ConsoleClient.mutation("Workspaces.restoreInvite"),
  transferOwnership: ConsoleClient.mutation("Workspaces.transferOwnership")
} as const
