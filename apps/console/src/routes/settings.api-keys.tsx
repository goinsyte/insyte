import { useAtomValue } from "@effect/atom-react"
import type { ApiKeyView } from "@insyte/modules/developer/domain/ApiKey"
import type { Roles } from "@insyte/modules/roles/domain/Roles"
import { DeveloperSourceProvider } from "@insyte/ui/app/developer/source"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { ApiKeysPage } from "@insyte/ui/app/settings/api-keys-screen"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { Key } from "@insyte/ui/icons"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { endpointsAtom, keysAtom } from "../data/developer.ts"
import { rolesAtom } from "../data/roles.ts"
import { sessionMeAtom } from "../data/session.ts"
import { LiveUpdates } from "../realtime/live-updates.tsx"
import { useConsoleDeveloperSource } from "../team/developer-source.ts"

/**
 * Instellingen → API-sleutels (step 6.1, M19.1): the reference's keys page over `ApiKeys.list` (and the roles a key may
 * hold), in the settings sheet, without the shell (M5). The loader reads both on the server.
 */
export const Route = createFileRoute("/settings/api-keys")({
  beforeLoad: async ({ context }) => {
    const me = await Effect.runPromise(
      AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
        Effect.asSome,
        Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
      )
    )
    if (Option.isNone(me)) throw redirect({ to: "/login", search: { redirect: "/settings/api-keys" } })
    if (me.value.landing !== "/dashboard") throw redirect({ href: me.value.landing })
  },
  head: () => ({ meta: [{ title: "API-sleutels · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(keysAtom)
    context.registry.mount(rolesAtom)
    context.registry.mount(endpointsAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, keysAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, rolesAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, endpointsAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: KeysRoute
})

function Pending() {
  return (
    <main className="min-h-svh bg-paper text-ink">
      <PageSkeleton kind="settings" title="API-sleutels" />
    </main>
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
  const source = useConsoleDeveloperSource(keys, roles, endpoints)
  return (
    <main className="min-h-svh bg-paper text-ink">
      <LiveUpdates />
      <DeveloperSourceProvider value={source}>
        <SettingsSheet title="API-sleutels" icon={Key}>
          <ApiKeysPage />
        </SettingsSheet>
      </DeveloperSourceProvider>
    </main>
  )
}
