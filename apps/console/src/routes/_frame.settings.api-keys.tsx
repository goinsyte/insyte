import { useAtomValue } from "@effect/atom-react"
import type { ApiKeyView } from "@insyte/modules/developer/domain/ApiKey"
import type { Roles } from "@insyte/modules/roles/domain/Roles"
import { DeveloperSourceProvider } from "@insyte/ui/app/developer/source"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { ApiKeysPage } from "@insyte/ui/app/settings/api-keys-screen"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { Key } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { endpointsAtom, keysAtom } from "../data/developer.ts"
import { rolesAtom } from "../data/roles.ts"
import { webhooksAtom } from "../data/webhooks.ts"
import { useConsoleDeveloperSource } from "../team/developer-source.ts"

/**
 * Instellingen → API-sleutels (step 6.1, M19.1): the reference's keys page over `ApiKeys.list` (and the roles a key may
 * hold), in the settings sheet, without the shell (M5). The loader reads both on the server.
 */
export const Route = createFileRoute("/_frame/settings/api-keys")({
  head: () => ({ meta: [{ title: "API-sleutels · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(keysAtom)
    context.registry.mount(rolesAtom)
    context.registry.mount(endpointsAtom)
    context.registry.mount(webhooksAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, keysAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, rolesAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, endpointsAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, webhooksAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: KeysRoute
})

function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="API-sleutels" />
    </div>
  )
}

function KeysRoute() {
  const keysResult = useAtomValue(keysAtom)
  const rolesResult = useAtomValue(rolesAtom)
  const endpointsResult = useAtomValue(endpointsAtom)
  const keys = Option.getOrUndefined(AsyncResult.value(keysResult))
  const roles = Option.getOrUndefined(AsyncResult.value(rolesResult))
  const endpoints = Option.getOrUndefined(AsyncResult.value(endpointsResult))
  if (keys === undefined || roles === undefined || endpoints === undefined) return <Pending />
  return <Loaded keys={keys} roles={roles} endpoints={endpoints} />
}

function Loaded(
  { keys, roles, endpoints }: {
    keys: ReadonlyArray<ApiKeyView>
    roles: Roles
    endpoints: { readonly mcp: string | null }
  }
) {
  // The webhooks card: its endpoints and how many fail, once they are in.
  const hooks = Option.getOrUndefined(AsyncResult.value(useAtomValue(webhooksAtom)))
  const source = useConsoleDeveloperSource(
    keys,
    roles,
    endpoints,
    hooks === undefined ? undefined : {
      count: hooks.length,
      failing: hooks.filter((w) => w.state === "failing" || w.state === "disabled").length
    }
  )
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <DeveloperSourceProvider value={source}>
        <SettingsSheet title="API-sleutels" icon={Key}>
          <ApiKeysPage />
        </SettingsSheet>
      </DeveloperSourceProvider>
    </div>
  )
}
