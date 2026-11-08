import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { OrderPage } from "@insyte/modules/orders/domain/Orders"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { OrdersList } from "@insyte/ui/app/orders/orders-screen"
import { OrdersSourceProvider } from "@insyte/ui/app/orders/source"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { ordersAtom } from "../data/orders.ts"
import { storesAtom } from "../data/stores.ts"
import { useConsoleOrdersSource } from "../orders/orders-source.ts"

/**
 * Bestellingen (step 8.4b, M6.4): the reference's orders list over `Orders.list`, in the frame. The loader reads the
 * orders and the stores (for the Winkel column) on the server, so the first paint has them; until they are in (a
 * client navigation), the reference's own table skeleton stands in. A role that may not see orders is told which
 * permission it misses.
 */
export const Route = createFileRoute("/_frame/orders")({
  validateSearch: (s: Record<string, unknown>): { status?: string; view?: string } => ({
    ...(typeof s["status"] === "string" ? { status: s["status"] } : {}),
    ...(typeof s["view"] === "string" ? { view: s["view"] } : {})
  }),
  head: () => ({ meta: [{ title: "Bestellingen · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(ordersAtom)
    context.registry.mount(storesAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, ordersAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, storesAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: OrdersRoute
})

function Pending() {
  return <PageSkeleton kind="table" title="Bestellingen" />
}

const isForbidden = Schema.is(Forbidden)

function OrdersRoute() {
  const result = useAtomValue(ordersAtom)
  const stores = Option.getOrUndefined(AsyncResult.value(useAtomValue(storesAtom))) ?? []
  // A refresh keeps showing the list as it was until the new one is in.
  const page = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (page !== undefined) return <Loaded page={page} stores={stores} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de bestellingen niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Orders.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ page, stores }: { page: OrderPage; stores: ReadonlyArray<StoreView> }) {
  const source = useConsoleOrdersSource(page, stores)
  return (
    <OrdersSourceProvider value={source}>
      <OrdersList />
    </OrdersSourceProvider>
  )
}
