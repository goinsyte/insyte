import { useAtomValue } from "@effect/atom-react"
import { Forbidden, NotFound } from "@insyte/domain/Errors"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { CustomerDetail } from "@insyte/ui/app/customers/customer-screen"
import { CustomerDetailSourceProvider } from "@insyte/ui/app/customers/detail-source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { arrivingCustomerDetail, consoleCustomerDetail } from "../customers/customer-detail-source.ts"
import { customerAtom, customersAtom } from "../data/customers.ts"

/**
 * One customer (step 8.4e, M6.4): the reference's profile over `Customers.get`, as the order is. Reached by its URL,
 * the server reads it before it renders; an unknown one (or outside the role's stores) is the router's not-found.
 * Opened from a row, it opens at once over the list, the record's own skeleton holding the body until it is in.
 */
export const Route = createFileRoute("/_frame/customers/$customerId")({
  head: () => ({ meta: [{ title: "Klant · Insyte" }] }),
  loader: async ({ context, params }) => {
    if (typeof window !== "undefined") return
    const atom = customerAtom(params.customerId)
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(atom)
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: Pending,
  component: CustomerRoute
})

function Pending() {
  return <PageSkeleton kind="document" />
}

const isForbidden = Schema.is(Forbidden)
const isNotFound = Schema.is(NotFound)

function CustomerRoute() {
  const { customerId } = Route.useParams()
  const result = useAtomValue(customerAtom(customerId))
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(customersAtom)))
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  if (detail !== undefined) {
    return (
      <CustomerDetailSourceProvider value={consoleCustomerDetail(detail)}>
        <CustomerDetail />
      </CustomerDetailSourceProvider>
    )
  }
  const failed = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  if (failed !== undefined && failed._tag === "Fail" && isNotFound(failed.error)) throw notFound()
  if (failed !== undefined && failed._tag === "Fail" && isForbidden(failed.error)) {
    return (
      <DeniedPanel
        title="Je rol kan deze klant niet zien"
        denial={{
          perm: failed.error.permission as Permission,
          arg: failed.error.level as Level,
          roleLabel: failed.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Customers.get"
        }}
      />
    )
  }
  const row = list?.rows.find((c) => c.id === customerId)
  if (row === undefined) return <Pending />
  return (
    <CustomerDetailSourceProvider value={arrivingCustomerDetail(row)}>
      <CustomerDetail />
    </CustomerDetailSourceProvider>
  )
}
