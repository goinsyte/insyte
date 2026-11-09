import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { SupplierList } from "@insyte/modules/suppliers/domain/Suppliers"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SuppliersSourceProvider } from "@insyte/ui/app/suppliers/source"
import { SuppliersPage } from "@insyte/ui/app/suppliers/suppliers-screen"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { suppliersAtom } from "../data/suppliers.ts"
import { useConsoleSuppliersSource } from "../suppliers/suppliers-source.tsx"

/**
 * Leveranciers (step 10.1, M8.1): the reference's suppliers page over `Suppliers.list`, in the frame. The loader reads
 * them on the server; until they are in, the reference's table skeleton stands in. A role that may not see suppliers is
 * told which permission it misses.
 */
export const Route = createFileRoute("/_frame/suppliers")({
  head: () => ({ meta: [{ title: "Leveranciers · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(suppliersAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, suppliersAtom)))
  },
  pendingComponent: Pending,
  component: SuppliersRoute
})

function Pending() {
  return <PageSkeleton kind="table" title="Leveranciers" />
}

const isForbidden = Schema.is(Forbidden)

function SuppliersRoute() {
  const result = useAtomValue(suppliersAtom)
  const list = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (list !== undefined) return <Loaded list={list} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de leveranciers niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Suppliers.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ list }: { list: SupplierList }) {
  const source = useConsoleSuppliersSource(list)
  return (
    <SuppliersSourceProvider value={source}>
      <SuppliersPage />
    </SuppliersSourceProvider>
  )
}
