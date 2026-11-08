import { useAtomValue } from "@effect/atom-react"
import type { Team } from "@insyte/modules/members/domain/Team"
import { InviteDialog } from "@insyte/ui/app/team/invite-dialog"
import { TeamSourceProvider } from "@insyte/ui/app/team/source"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { teamAtom } from "../data/team.ts"
import { useConsoleTeamSource } from "../team/team-source.ts"

/**
 * Inviting from the store menu, in the frame (step 7.4c): Team's own dialog over the console's Team source, read when
 * it opens. A role that may not see the team never gets the menu item (it is gated in the design).
 */
export function ConsoleInvite({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!open) return null
  return <WithTeam onOpenChange={onOpenChange} />
}

function WithTeam({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const team = Option.getOrUndefined(AsyncResult.value(useAtomValue(teamAtom)))
  return team === undefined ? null : <Dialog team={team} onOpenChange={onOpenChange} />
}

function Dialog({ team, onOpenChange }: { team: Team; onOpenChange: (open: boolean) => void }) {
  return (
    <TeamSourceProvider value={useConsoleTeamSource(team)}>
      <InviteDialog open onOpenChange={onOpenChange} />
    </TeamSourceProvider>
  )
}
