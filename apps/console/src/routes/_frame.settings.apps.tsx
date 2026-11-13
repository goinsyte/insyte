import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { SettingsAppsPage } from "@insyte/ui/app/settings/apps-screen"
import { BadgePercent } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { catalogAtom, installsAtom, recommendedAtom } from "../data/marketplace.ts"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Apps (M17 step 3): the reference's installed apps over `Marketplace.catalog` and
 * `Marketplace.installs`, read on the server; the shell's Marketplace source draws them and does what a row asks.
 * Reading takes Integraties · Bekijken; a role below Bewerken reads the page with its controls disabled.
 */
export const Route = createFileRoute("/_frame/settings/apps")({
  head: () => ({ meta: [{ title: "Apps · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(catalogAtom)
    context.registry.mount(installsAtom)
    context.registry.mount(recommendedAtom)
    await Effect.runPromise(Effect.ignore(Effect.all([
      AtomRegistry.getResult(context.registry, catalogAtom),
      AtomRegistry.getResult(context.registry, installsAtom),
      AtomRegistry.getResult(context.registry, recommendedAtom)
    ], { concurrency: 3 })))
  },
  pendingComponent: () => <SettingsPending title="Apps" />,
  component: AppsRoute
})

function AppsRoute() {
  const catalog = useAtomValue(catalogAtom)
  const installs = useAtomValue(installsAtom)
  const retryCatalog = useAtomRefresh(catalogAtom)
  const retryInstalls = useAtomRefresh(installsAtom)
  return (
    <SettingsPage
      result={AsyncResult.all({ catalog, installs })}
      title="Apps"
      icon={BadgePercent}
      denied="Je rol kan de apps van deze workspace niet zien"
      action="Marketplace.installs"
      edit={{ area: "integrations", level: 2 }}
      retry={() => {
        retryCatalog()
        retryInstalls()
      }}
    >
      {() => <SettingsAppsPage />}
    </SettingsPage>
  )
}
