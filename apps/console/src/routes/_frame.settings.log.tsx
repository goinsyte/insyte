import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { AuditFacets } from "@insyte/modules/audit/domain/Audit"
import { LogPage } from "@insyte/ui/app/settings/depth/log-screen"
import { LogSourceProvider } from "@insyte/ui/app/settings/log-source"
import { FileText } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { firstLogAtom, logFacetsAtom } from "../data/settings-log.ts"
import { useConsoleLogSource } from "../settings/log-source.tsx"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Logboek (M17 step 20.1a): every settings change over `Audit.list`, its people and pages over
 * `Audit.facets`, both read on the server for the first view (the last 30 days). Reading takes Instellingen · Bekijken;
 * the export also Exporteren, which the server checks.
 */
export const Route = createFileRoute("/_frame/settings/log")({
  head: () => ({ meta: [{ title: "Logboek · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(firstLogAtom)
    context.registry.mount(logFacetsAtom)
    await Effect.runPromise(Effect.ignore(Effect.all([
      AtomRegistry.getResult(context.registry, firstLogAtom),
      AtomRegistry.getResult(context.registry, logFacetsAtom)
    ], { concurrency: 2 })))
  },
  pendingComponent: () => <SettingsPending title="Logboek" />,
  component: LogRoute
})

function LogRoute() {
  const first = useAtomValue(firstLogAtom)
  const facets = useAtomValue(logFacetsAtom)
  const retryFirst = useAtomRefresh(firstLogAtom)
  const retryFacets = useAtomRefresh(logFacetsAtom)
  return (
    <SettingsPage
      result={AsyncResult.all({ first, facets })}
      title="Logboek"
      icon={FileText}
      denied="Je rol kan het logboek niet zien"
      action="Audit.list"
      edit={{ area: "settings", level: 1 }}
      retry={() => {
        retryFirst()
        retryFacets()
      }}
    >
      {(value) => <Loaded facets={value.facets} />}
    </SettingsPage>
  )
}

function Loaded({ facets }: { facets: AuditFacets }) {
  const source = useConsoleLogSource(facets)
  return (
    <LogSourceProvider value={source}>
      <LogPage />
    </LogSourceProvider>
  )
}
