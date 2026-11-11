import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { Regional } from "@insyte/modules/workspaces/domain/Settings"
import { RegionalPage } from "@insyte/ui/app/settings/regional-screen"
import { RegionalSourceProvider } from "@insyte/ui/app/settings/workspace-source"
import { Globe } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { regionalAtom } from "../data/workspace.ts"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"
import { useConsoleRegionalSource } from "../settings/workspace-source.tsx"

/**
 * Instellingen → Regio (M3.1): the reference's Taal en notatie over `Workspaces.getRegional`, read on the server.
 * Reading takes Instellingen · Bekijken, changing Bewerken. The console speaks Dutch only, so Taal is kept for later.
 */
export const Route = createFileRoute("/_frame/settings/regional")({
  head: () => ({ meta: [{ title: "Regio · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(regionalAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, regionalAtom)))
  },
  pendingComponent: () => <SettingsPending title="Regio" />,
  component: RegionalRoute
})

function RegionalRoute() {
  const result = useAtomValue(regionalAtom)
  const retry = useAtomRefresh(regionalAtom)
  return (
    <SettingsPage
      result={result}
      title="Regio"
      icon={Globe}
      denied="Je rol kan de regio-instellingen niet zien"
      action="Workspaces.getRegional"
      edit={{ area: "settings", level: 2 }}
      retry={retry}
    >
      {(saved) => <Loaded saved={saved} />}
    </SettingsPage>
  )
}

function Loaded({ saved }: { saved: Regional }) {
  const source = useConsoleRegionalSource(saved)
  return (
    <RegionalSourceProvider value={source}>
      <RegionalPage />
    </RegionalSourceProvider>
  )
}
