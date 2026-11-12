import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { TrashList } from "@insyte/modules/trash/domain/Trash"
import { TrashPage } from "@insyte/ui/app/settings/depth/trash-screen"
import { TrashSourceProvider } from "@insyte/ui/app/settings/trash-source"
import { Trash2 } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { trashAtom } from "../data/settings-log.ts"
import { useGate } from "../frame/refusals.ts"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"
import { useConsoleTrashSource } from "../settings/trash-source.tsx"

/**
 * Instellingen → Prullenbak (M17 step 20.1a): what was deleted in the last 30 days, over `Trash.list`, read on the
 * server. It takes Instellingen · Bewerken to open; putting an item back also takes what its own slice asks, purging
 * Beheren in its area, which the server checks.
 */
export const Route = createFileRoute("/_frame/settings/trash")({
  head: () => ({ meta: [{ title: "Prullenbak · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(trashAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, trashAtom)))
  },
  pendingComponent: () => <SettingsPending title="Prullenbak" />,
  component: TrashRoute
})

function TrashRoute() {
  const result = useAtomValue(trashAtom)
  const retry = useAtomRefresh(trashAtom)
  return (
    <SettingsPage
      result={result}
      title="Prullenbak"
      icon={Trash2}
      denied="Je rol kan de prullenbak niet zien"
      action="Trash.list"
      edit={{ area: "settings", level: 2 }}
      retry={retry}
    >
      {(list) => <Loaded list={list} />}
    </SettingsPage>
  )
}

function Loaded({ list }: { list: TrashList }) {
  const gate = useGate("settings", 2)
  const source = useConsoleTrashSource(list, gate.ok)
  return (
    <TrashSourceProvider value={source}>
      <TrashPage />
    </TrashSourceProvider>
  )
}
