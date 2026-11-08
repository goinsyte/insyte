import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { StoresPage } from "@insyte/ui/app/settings/stores-screen"
import { StoresSourceProvider } from "@insyte/ui/app/shops/source"
import { Building } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useEffect } from "react"
import { toast } from "sonner"
import { storesAtom } from "../data/stores.ts"
import { useConsoleStoresSource } from "../stores/stores-source.tsx"

/**
 * Instellingen → Winkels (step 8.1, M6.2): the reference's stores page over `Stores.list`, in the settings sheet. The
 * loader reads it on the server. Shopify's approval comes back through the API's callback to here: `?connected=shopify`
 * with the store, or `?error=` with why it did not connect, said once and taken out of the address.
 */
export const Route = createFileRoute("/_frame/settings/stores")({
  validateSearch: (s: Record<string, unknown>): { connected?: "shopify"; store?: string; error?: string } => ({
    ...(s["connected"] === "shopify" ? { connected: "shopify" as const } : {}),
    ...(typeof s["store"] === "string" ? { store: s["store"] } : {}),
    ...(typeof s["error"] === "string" ? { error: s["error"] } : {})
  }),
  head: () => ({ meta: [{ title: "Winkels · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(storesAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, storesAtom)))
  },
  pendingComponent: Pending,
  component: StoresRoute
})

/** Why a connection came back without a store, as the callback names it. */
const NOT_CONNECTED: Record<string, { title: string; description: string }> = {
  elsewhere: {
    title: "Deze winkel hangt aan een andere werkruimte",
    description: "Ontkoppel hem daar eerst, dan kun je hem hier koppelen."
  },
  shop: { title: "Shopify gaf een andere winkel terug", description: "Probeer het opnieuw met hetzelfde adres." }
}
const FAILED = { title: "Koppelen is niet gelukt", description: "Probeer het opnieuw." }

function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="Winkels" />
    </div>
  )
}

function StoresRoute() {
  const result = useAtomValue(storesAtom)
  const stores = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (stores !== undefined) return <Loaded stores={stores} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return <Refused forbidden={refused.error} />
  }
  return <Pending />
}

const isForbidden = Schema.is(Forbidden)

function Refused({ forbidden }: { forbidden: Forbidden }) {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <SettingsSheet title="Winkels" icon={Building}>
        <DeniedPanel
          title="Je rol kan de winkels niet zien"
          denial={{
            perm: forbidden.permission as Permission,
            arg: forbidden.level as Level,
            roleLabel: forbidden.roleLabel,
            grantingRoles: [],
            granters: [],
            request: { state: "none" },
            action: "Stores.list"
          }}
        />
      </SettingsSheet>
    </div>
  )
}

function Loaded({ stores }: { stores: ReadonlyArray<StoreView> }) {
  const source = useConsoleStoresSource(stores)
  const { connected, store, error } = Route.useSearch()
  const navigate = Route.useNavigate()

  // Back from Shopify: said once, then out of the address so a reload does not say it again.
  useEffect(() => {
    if (connected === undefined && error === undefined) return
    if (connected !== undefined) {
      const name = stores.find((s) => s.id === store)?.name
      toast.success(name === undefined ? "Je winkel is gekoppeld" : `${name} is gekoppeld`)
    } else {
      const said = NOT_CONNECTED[error ?? ""] ?? FAILED
      toast.error(said.title, { description: said.description })
    }
    void navigate({ search: {}, replace: true })
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once per arrival
  }, [connected, error])

  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <StoresSourceProvider value={source}>
        <SettingsSheet title="Winkels" icon={Building}>
          <StoresPage />
        </SettingsSheet>
      </StoresSourceProvider>
    </div>
  )
}
