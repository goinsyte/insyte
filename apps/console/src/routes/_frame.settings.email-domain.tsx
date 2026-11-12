import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { SendingDomainState } from "@insyte/modules/settings/domain/SendingDomain"
import { EmailDomainPage } from "@insyte/ui/app/settings/depth/email-domain-screen"
import { SettingsDepthSourceProvider } from "@insyte/ui/app/settings/depth/source"
import { Mail } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { sendingDomainAtom } from "../data/settings-depth.ts"
import { useConsoleDomainSource } from "../settings/domain-source.ts"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → E-mail en domein (M17 step 20.1c): the brand's sending domain at Resend with its four DNS records,
 * "Opnieuw controleren" and the senders, over `SendingDomain.*`. Reading takes Instellingen · Bekijken; checking again
 * and changing the senders Bewerken. Where the environment cannot manage domains the page says so, with no records.
 */
export const Route = createFileRoute("/_frame/settings/email-domain")({
  head: () => ({ meta: [{ title: "E-mail en domein · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(sendingDomainAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, sendingDomainAtom)))
  },
  pendingComponent: () => <SettingsPending title="E-mail en domein" />,
  component: EmailDomainRoute
})

function EmailDomainRoute() {
  const result = useAtomValue(sendingDomainAtom)
  const retry = useAtomRefresh(sendingDomainAtom)
  return (
    <SettingsPage
      result={result}
      title="E-mail en domein"
      icon={Mail}
      denied="Je rol kan het e-maildomein niet zien"
      action="SendingDomain.get"
      edit={{ area: "settings", level: 2 }}
      retry={retry}
    >
      {(state) => <Loaded state={state} />}
    </SettingsPage>
  )
}

function Loaded({ state }: { state: SendingDomainState }) {
  const source = useConsoleDomainSource(state)
  return (
    <SettingsDepthSourceProvider value={source}>
      <EmailDomainPage />
    </SettingsDepthSourceProvider>
  )
}
