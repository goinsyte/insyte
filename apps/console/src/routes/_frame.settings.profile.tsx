import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { WorkspaceAccount } from "@insyte/modules/workspaces/domain/Settings"
import { AccountSettingsPage } from "@insyte/ui/app/settings/profile-screen"
import { AccountSourceProvider } from "@insyte/ui/app/settings/workspace-source"
import { User } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { storesAtom } from "../data/stores.ts"
import { teamAtom } from "../data/team.ts"
import { accountAtom } from "../data/workspace.ts"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"
import { useConsoleAccountSource } from "../settings/workspace-source.tsx"

/**
 * Instellingen → Account (M3.1): the reference's account page over `Workspaces.getAccount`, with the team and the stores
 * counted beside it. The loader reads all three on the server; a role that cannot see the team or the stores just gets
 * no count. Reading takes Instellingen · Bekijken, changing Bewerken.
 */
export const Route = createFileRoute("/_frame/settings/profile")({
  head: () => ({ meta: [{ title: "Account · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(accountAtom)
    context.registry.mount(teamAtom)
    context.registry.mount(storesAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, accountAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, teamAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, storesAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: () => <SettingsPending title="Account" />,
  component: AccountRoute
})

function AccountRoute() {
  const result = useAtomValue(accountAtom)
  const retry = useAtomRefresh(accountAtom)
  return (
    <SettingsPage
      result={result}
      title="Account"
      icon={User}
      denied="Je rol kan de werkruimte niet zien"
      action="Workspaces.getAccount"
      edit={{ area: "settings", level: 2 }}
      retry={retry}
    >
      {(saved) => <Loaded saved={saved} />}
    </SettingsPage>
  )
}

function Loaded({ saved }: { saved: WorkspaceAccount }) {
  const source = useConsoleAccountSource(saved)
  return (
    <AccountSourceProvider value={source}>
      <AccountSettingsPage />
    </AccountSourceProvider>
  )
}
