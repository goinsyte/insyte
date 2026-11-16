import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { ConnectionList } from "@insyte/modules/stores/domain/Connections"
import { IntegrationsPage } from "@insyte/ui/app/settings/integrations-screen"
import { IntegrationsSourceProvider } from "@insyte/ui/app/settings/integrations-source"
import { Plug } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useMemo } from "react"
import { frameAtom } from "../data/frame.ts"
import { channelsAtom } from "../data/inbox.ts"
import { connectionsAtom } from "../data/integrations.ts"
import { consoleIntegrationsSource } from "../settings/integrations-source.ts"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"
import { WebchatConnectDialog, WebchatManageDialog } from "../settings/webchat.tsx"

/**
 * Instellingen → Koppelingen (M6, widgets/05 §5.1): the reference's list of every service Insyte reads from, over
 * `Connections.list`, read on the server. Reading takes Koppelingen · Bekijken. The page changes nothing itself: each
 * row opens the page that manages it, which asks its own rights, so no role reads this page as Alleen lezen. The website
 * chat (M15 step 8) is the exception: it connects here, and `?chat=` opens a connected store's.
 */
export const Route = createFileRoute("/_frame/settings/integrations")({
  validateSearch: (s: Record<string, unknown>): { chat?: string | undefined } =>
    typeof s["chat"] === "string" && s["chat"] !== "" ? { chat: s["chat"] } : {},
  head: () => ({ meta: [{ title: "Koppelingen · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(connectionsAtom)
    context.registry.mount(channelsAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, connectionsAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, channelsAtom))
      ], { concurrency: "unbounded" })
    )
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
  const chat = Option.getOrUndefined(AsyncResult.value(useAtomValue(channelsAtom)))
  const stores = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))?.stores.length ?? 1
  const { chat: managing } = Route.useSearch()
  const navigate = Route.useNavigate()
  const source = useMemo(
    () => ({ ...consoleIntegrationsSource(list, chat, stores), ChannelDialog: WebchatConnectDialog }),
    [list, chat, stores]
  )
  return (
    <IntegrationsSourceProvider value={source}>
      <IntegrationsPage />
      <WebchatManageDialog id={managing} onClose={() => void navigate({ search: {} })} />
    </IntegrationsSourceProvider>
  )
}
