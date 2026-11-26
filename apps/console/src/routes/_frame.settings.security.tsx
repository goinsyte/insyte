import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { ActiveSession } from "@insyte/domain/Session"
import type { SecurityPolicy } from "@insyte/modules/workspaces/domain/Security"
import { SecurityPage } from "@insyte/ui/app/settings/security-screen"
import { SecuritySourceProvider } from "@insyte/ui/app/settings/security-source"
import { Shield } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { securityAtom, sessionsAtom } from "../data/security.ts"
import { useConsoleSecuritySource } from "../settings/security-source.tsx"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Beveiliging (M3.3): the reference's Authenticatie, Actieve sessies and Auditlog over
 * `Workspaces.getSecurity` and `Session.listSessions`, both read on the server. Reading takes Instellingen · Bekijken;
 * as in the reference's settings layout, a role below Bewerken reads the page with its controls disabled.
 */
export const Route = createFileRoute("/_frame/settings/security")({
  head: () => ({ meta: [{ title: "Beveiliging · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(securityAtom)
    context.registry.mount(sessionsAtom)
    await Effect.runPromise(Effect.ignore(Effect.all([
      AtomRegistry.getResult(context.registry, securityAtom),
      AtomRegistry.getResult(context.registry, sessionsAtom)
    ], { concurrency: 2 })))
  },
  pendingComponent: () => <SettingsPending title="Beveiliging" />,
  component: SecurityRoute
})

function SecurityRoute() {
  const policy = useAtomValue(securityAtom)
  const sessions = useAtomValue(sessionsAtom)
  const retryPolicy = useAtomRefresh(securityAtom)
  const retrySessions = useAtomRefresh(sessionsAtom)
  return (
    <SettingsPage
      result={AsyncResult.all({ policy, sessions })}
      title="Beveiliging"
      icon={Shield}
      denied="Je rol kan de beveiligingsinstellingen niet zien"
      action="Workspaces.getSecurity"
      edit={{ area: "settings", level: 2 }}
      retry={() => {
        retryPolicy()
        retrySessions()
      }}
    >
      {(value) => <Loaded policy={value.policy} sessions={value.sessions} />}
    </SettingsPage>
  )
}

function Loaded({ policy, sessions }: { policy: SecurityPolicy; sessions: ReadonlyArray<ActiveSession> }) {
  const source = useConsoleSecuritySource(policy, sessions)
  return (
    <SecuritySourceProvider value={source}>
      <SecurityPage />
    </SecuritySourceProvider>
  )
}
