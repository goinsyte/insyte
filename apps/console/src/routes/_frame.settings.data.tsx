import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { Inventory, PrivacyRequests } from "@insyte/modules/privacy/domain/Privacy"
import { YourDataPage } from "@insyte/ui/app/settings/data-screen"
import { DataSourceProvider } from "@insyte/ui/app/settings/data-source"
import { Database } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { inventoryAtom, requestsAtom } from "../data/privacy.ts"
import { useConsoleDataSource } from "../settings/data-source.tsx"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Je gegevens (M17 step 5, PLAN 48): what the workspace holds, where, and who reaches it, over
 * `Privacy.inventory`; the exports, the shoppers' requests and a waiting deletion over `Privacy.requests`; both read on
 * the server. Opening it takes Instellingen · Bewerken. Each action gates itself: the export, its schedule and the
 * deletion are the owner's, a shopper's package Exporteren with Klanten · Bekijken, erasing Klanten · Beheren.
 */
export const Route = createFileRoute("/_frame/settings/data")({
  head: () => ({ meta: [{ title: "Je gegevens · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(inventoryAtom)
    context.registry.mount(requestsAtom)
    await Effect.runPromise(Effect.ignore(Effect.all([
      AtomRegistry.getResult(context.registry, inventoryAtom),
      AtomRegistry.getResult(context.registry, requestsAtom)
    ], { concurrency: 2 })))
  },
  pendingComponent: () => <SettingsPending title="Je gegevens" />,
  component: DataRoute
})

function DataRoute() {
  const inventory = useAtomValue(inventoryAtom)
  const requests = useAtomValue(requestsAtom)
  const retryInventory = useAtomRefresh(inventoryAtom)
  const retryRequests = useAtomRefresh(requestsAtom)
  return (
    <SettingsPage
      result={AsyncResult.all({ inventory, requests })}
      title="Je gegevens"
      icon={Database}
      denied="Je rol kan niet zien welke gegevens deze werkruimte bewaart"
      action="Privacy.inventory"
      edit={{ area: "settings", level: 2 }}
      retry={() => {
        retryInventory()
        retryRequests()
      }}
    >
      {(value) => <Loaded inventory={value.inventory} requests={value.requests} />}
    </SettingsPage>
  )
}

function Loaded({ inventory, requests }: { inventory: Inventory; requests: PrivacyRequests }) {
  const source = useConsoleDataSource(inventory, requests)
  return (
    <DataSourceProvider value={source}>
      <YourDataPage />
    </DataSourceProvider>
  )
}
