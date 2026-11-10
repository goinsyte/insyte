import { useAtomValue } from "@effect/atom-react"
import { ReturnPortal } from "@insyte/ui/app/returns/portal/portal-screen"
import { PortalSourceProvider } from "@insyte/ui/app/returns/portal/source"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { portalStoreAtom } from "../data/portal.ts"
import { useConsolePortalSource } from "../portal/portal-source.ts"

/**
 * The public returns portal, `/retour/<handle>` (step 11.5, M9.3): the reference's page over `Portal.*`, for a shopper
 * without an account. The store's page is read on the server, so the first paint is the store's own, or "Deze winkel
 * vinden we niet".
 */
export const Route = createFileRoute("/retour/$storeHandle")({
  loader: async ({ context, params }) => {
    const atom = portalStoreAtom(params.storeHandle)
    context.registry.mount(atom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, atom)))
  },
  head: () => ({ meta: [{ title: "Retourneren" }] }),
  component: PortalRoute
})

function PortalRoute() {
  const { storeHandle } = Route.useParams()
  const result = useAtomValue(portalStoreAtom(storeHandle))
  if (AsyncResult.isInitial(result)) return null
  const store = AsyncResult.isSuccess(result) ? result.value : Option.getOrNull(AsyncResult.value(result))
  return <Loaded handle={storeHandle} store={store} />
}

function Loaded({ handle, store }: { handle: string; store: Parameters<typeof useConsolePortalSource>[1] }) {
  const source = useConsolePortalSource(handle, store)
  return (
    <PortalSourceProvider value={source}>
      <ReturnPortal />
    </PortalSourceProvider>
  )
}
