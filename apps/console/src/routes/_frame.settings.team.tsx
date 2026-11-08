import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { Team } from "@insyte/modules/members/domain/Team"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { TeamPage } from "@insyte/ui/app/settings/team-screen"
import { TeamSourceProvider } from "@insyte/ui/app/team/source"
import { Users } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { myAccessAtom } from "../data/access.ts"
import { teamAtom } from "../data/team.ts"
import { useConsoleTeamSource } from "../team/team-source.ts"

/**
 * Instellingen → Team (step 4.3, M3.3–M3.4): the reference's team page over `Team.get`, in the settings sheet, without
 * the shell (M5). The loader reads it on the server, so the first paint has it; until it is in (a client navigation),
 * the reference's own settings skeleton stands in. Signed out it is sign-in with the way back; a person still in
 * onboarding goes on with it.
 */
export const Route = createFileRoute("/_frame/settings/team")({
  head: () => ({ meta: [{ title: "Team · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(teamAtom)
    context.registry.mount(myAccessAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, teamAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, myAccessAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: TeamRoute
})

/** What the reference shows while this page loads. */
function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="Team" />
    </div>
  )
}

function TeamRoute() {
  const result = useAtomValue(teamAtom)
  // A refresh keeps showing the page as it was until the new one is in.
  const team = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (team !== undefined) return <Loaded team={team} />
  // The role may not see the team: the server said which permission, and that is what the page says.
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return <Refused forbidden={refused.error} />
  }
  return <Pending />
}

const isForbidden = Schema.is(Forbidden)

function Refused({ forbidden }: { forbidden: Forbidden }) {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <SettingsSheet title="Team" icon={Users}>
        <DeniedPanel
          title="Je rol kan het team niet zien"
          denial={{
            perm: forbidden.permission as Permission,
            arg: forbidden.level as Level,
            roleLabel: forbidden.roleLabel,
            grantingRoles: [],
            granters: [],
            request: { state: "none" },
            action: "Team.get"
          }}
        />
      </SettingsSheet>
    </div>
  )
}

function Loaded({ team }: { team: Team }) {
  const source = useConsoleTeamSource(team)
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <TeamSourceProvider value={source}>
        <SettingsSheet title="Team" icon={Users}>
          <TeamPage />
        </SettingsSheet>
      </TeamSourceProvider>
    </div>
  )
}
