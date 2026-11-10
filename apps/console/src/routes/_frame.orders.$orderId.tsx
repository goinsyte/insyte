import { useAtomValue } from "@effect/atom-react"
import { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { OrderDetail } from "@insyte/modules/orders/domain/Orders"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { OrderDetailSourceProvider } from "@insyte/ui/app/orders/detail-source"
import { OrderDetailPage } from "@insyte/ui/app/orders/order-screen"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { orderAtom, ordersAtom } from "../data/orders.ts"
import { ConsoleTracker } from "../orders/forwarding-source.tsx"
import { arrivingOrderDetail, useConsoleOrderDetail } from "../orders/order-detail-source.ts"
import { ConsoleOrderReturns, ConsoleStartReturn } from "../returns/returns-source.tsx"

/** The order's returns in its sidebar, and "Retour starten" (M9.1). */
const RETURNS = { Dialog: ConsoleStartReturn, Panel: ConsoleOrderReturns }

/**
 * One order (step 8.4d, M6.4): the reference's record over `Orders.get`. Reached by its URL, the server reads it
 * before it renders, so the page arrives whole, and an order that is not there (or outside the role's stores) is the
 * router's not-found. Opened from a row, it opens at once over the list: the row draws the header and the record's
 * own skeleton holds the body until the order is in, as the reference draws it.
 */
export const Route = createFileRoute("/_frame/orders/$orderId")({
  head: () => ({ meta: [{ title: "Bestelling · Insyte" }] }),
  loader: async ({ context, params }) => {
    if (typeof window !== "undefined") return
    const atom = orderAtom(params.orderId)
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(atom)
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: Pending,
  component: OrderRoute
})

function Pending() {
  return <PageSkeleton kind="document" />
}

const isForbidden = Schema.is(Forbidden)
const isNotFound = Schema.is(NotFound)

function OrderRoute() {
  const { orderId } = Route.useParams()
  const result = useAtomValue(orderAtom(orderId))
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(ordersAtom)))
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  if (detail !== undefined) return <Loaded detail={detail} />
  const failed = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  if (failed !== undefined && failed._tag === "Fail" && isNotFound(failed.error)) throw notFound()
  if (failed !== undefined && failed._tag === "Fail" && isForbidden(failed.error)) {
    return (
      <DeniedPanel
        title="Je rol kan deze bestelling niet zien"
        denial={{
          perm: failed.error.permission as Permission,
          arg: failed.error.level as Level,
          roleLabel: failed.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Orders.get"
        }}
      />
    )
  }
  const row = list?.rows.find((o) => o.id === orderId)
  if (row === undefined) return <Pending />
  return (
    <OrderDetailSourceProvider value={arrivingOrderDetail(row)}>
      <OrderDetailPage />
    </OrderDetailSourceProvider>
  )
}

function Loaded({ detail }: { detail: OrderDetail }) {
  return (
    <OrderDetailSourceProvider value={{ ...useConsoleOrderDetail(detail), Tracker: ConsoleTracker, Returns: RETURNS }}>
      <OrderDetailPage />
    </OrderDetailSourceProvider>
  )
}
