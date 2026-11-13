import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { WebhookEndpointView } from "@insyte/modules/developer/domain/Webhook"
import { WebhooksSourceProvider } from "@insyte/ui/app/developer/webhooks-source"
import { WebhooksPage } from "@insyte/ui/app/settings/webhooks-screen"
import { Webhook } from "@insyte/ui/icons"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { rolesAtom } from "../data/roles.ts"
import { storesAtom } from "../data/stores.ts"
import { webhooksAtom } from "../data/webhooks.ts"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"
import { useConsoleWebhooksSource } from "../settings/webhooks-source.ts"

interface Search {
  readonly endpoint?: string
  readonly levering?: string
}

/**
 * Instellingen → Webhooks (step 19a, M19.4): the reference's endpoints, their deliveries and one delivery in the drawer,
 * over `Webhooks.list` (with the stores an endpoint may be narrowed to and the team's names), in the settings sheet.
 * Reading takes Koppelingen en API · Bekijken; a role below Bewerken reads it with its controls disabled. The open
 * endpoint and delivery are in the address, as in the reference.
 */
export const Route = createFileRoute("/_frame/settings/webhooks")({
  head: () => ({ meta: [{ title: "Webhooks · Insyte" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["endpoint"] === "string" ? { endpoint: s["endpoint"] } : {}),
    ...(typeof s["levering"] === "string" ? { levering: s["levering"] } : {})
  }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(webhooksAtom)
    context.registry.mount(storesAtom)
    context.registry.mount(rolesAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, webhooksAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, storesAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, rolesAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: () => <SettingsPending title="Webhooks" />,
  component: WebhooksRoute
})

function WebhooksRoute() {
  const result = useAtomValue(webhooksAtom)
  const retry = useAtomRefresh(webhooksAtom)
  return (
    <SettingsPage
      result={result}
      title="Webhooks"
      icon={Webhook}
      denied="Je rol kan de webhooks niet zien"
      action="Webhooks.list"
      edit={{ area: "integrations", level: 2 }}
      retry={retry}
    >
      {(endpoints) => <Loaded endpoints={endpoints} />}
    </SettingsPage>
  )
}

function Loaded({ endpoints }: { endpoints: ReadonlyArray<WebhookEndpointView> }) {
  const search = Route.useSearch()
  const navigate = useNavigate()
  // The stores and the team's names are extras: a role that may not read them gets the page without them.
  const stores = Option.getOrUndefined(AsyncResult.value(useAtomValue(storesAtom))) ?? []
  const roles = Option.getOrUndefined(AsyncResult.value(useAtomValue(rolesAtom)))
  const source = useConsoleWebhooksSource({
    endpoints,
    stores,
    roles,
    search,
    go: (next, options) =>
      void navigate({ to: "/settings/webhooks", search: next, ...(options?.replace === true ? { replace: true } : {}) })
  })
  return (
    <WebhooksSourceProvider value={source}>
      <WebhooksPage />
    </WebhooksSourceProvider>
  )
}
