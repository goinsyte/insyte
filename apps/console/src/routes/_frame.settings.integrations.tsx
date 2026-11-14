import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { ConnectionList } from "@insyte/modules/stores/domain/Connections"
import { IntegrationsPage } from "@insyte/ui/app/settings/integrations-screen"
import { IntegrationsSourceProvider } from "@insyte/ui/app/settings/integrations-source"
import { Plug } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { useMemo } from "react"
import { connectionsAtom } from "../data/integrations.ts"
import { consoleIntegrationsSource } from "../settings/integrations-source.ts"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Koppelingen (M6, widgets/05 §5.1): the reference's list of every service Insyte reads from, over
 * `Connections.list`, read on the server. Reading takes Koppelingen · Bekijken. The page changes nothing itself: each
 * row opens the page that manages it, which asks its own rights, so no role reads this page as Alleen lezen.
 */
export const Route = createFileRoute("/_frame/settings/integrations")({
  head: () => ({ meta: [{ title: "Koppelingen · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(connectionsAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, connectionsAtom)))
  },
  pendingComponent: () => <SettingsPending title="Koppelingen" />,
  component: IntegrationsRoute
})

function IntegrationsRoute() {
  const connections = useAtomValue(connectionsAtom)
  const retry = useAtomRefresh(connectionsAtom)
  return (
    <SettingsPage
      result={connections}
      title="Koppelingen"
      icon={Plug}
      denied="Je rol kan de koppelingen van deze workspace niet zien"
      action="Connections.list"
      edit={{ area: "integrations", level: 1 }}
      retry={retry}
    >
      {(list) => <Loaded list={list} />}
    </SettingsPage>
  )
}

function Loaded({ list }: { list: ConnectionList }) {
  const source = useMemo(() => consoleIntegrationsSource(list), [list])
  return (
    <IntegrationsSourceProvider value={source}>
      <IntegrationsPage />
    </IntegrationsSourceProvider>
  )
}
