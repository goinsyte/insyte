import { useAtomValue } from "@effect/atom-react"
import type { Team } from "@insyte/modules/members/domain/Team"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { TeamPage } from "@insyte/ui/app/settings/team-screen"
import { TeamSourceProvider } from "@insyte/ui/app/team/source"
import { Users } from "@insyte/ui/icons"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { sessionMeAtom } from "../data/session.ts"
import { teamAtom } from "../data/team.ts"
import { useConsoleTeamSource } from "../team/team-source.ts"

/**
 * Instellingen → Team (step 4.3, M3.3–M3.4): the reference's team page over `Team.get`, in the settings sheet, without
 * the shell (M5). The loader reads it on the server, so the first paint has it; until it is in (a client navigation),
 * the reference's own settings skeleton stands in. Signed out it is sign-in with the way back; a person still in
 * onboarding goes on with it.
 */
export const Route = createFileRoute("/settings/team")({
  beforeLoad: async ({ context }) => {
    const me = await Effect.runPromise(
      AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
        Effect.asSome,
        Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
      )
    )
    if (Option.isNone(me)) throw redirect({ to: "/login", search: { redirect: "/settings/team" } })
    if (me.value.landing !== "/dashboard") throw redirect({ href: me.value.landing })
  },
  head: () => ({ meta: [{ title: "Team · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(teamAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, teamAtom)))
  },
  pendingComponent: Pending,
  component: TeamRoute
})

/** What the reference shows while this page loads. */
function Pending() {
  return (
    <main className="min-h-svh bg-paper text-ink">
      <PageSkeleton kind="settings" title="Team" />
    </main>
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
  if (team === undefined) return <Pending />
  return <Loaded team={team} />
}

function Loaded({ team }: { team: Team }) {
  const source = useConsoleTeamSource(team)
  return (
    <main className="min-h-svh bg-paper text-ink">
      <TeamSourceProvider value={source}>
        <SettingsSheet title="Team" icon={Users}>
          <TeamPage />
        </SettingsSheet>
      </TeamSourceProvider>
    </main>
  )
}
