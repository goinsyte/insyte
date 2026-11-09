import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { CustomerPage } from "@insyte/modules/customers/domain/Customers"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { OPEN_AS_MODAL, useOpenedAsModal } from "@insyte/ui/app/common/detail-shell"
import { CustomersPage } from "@insyte/ui/app/customers/customers-screen"
import { CustomersSourceProvider } from "@insyte/ui/app/customers/source"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleCustomersSource } from "../customers/customers-source.ts"
import { customersAtom } from "../data/customers.ts"

/**
 * Klanten (step 8.4c, M6.4): the reference's customers list over `Customers.list`, in the frame. The loader reads them
 * on the server; until they are in, the reference's table skeleton stands in. A role that may not see customers is
 * told which permission it misses.
 *
 * The list is this layout rather than `/customers/`, as with Bestellingen, so a row opened over it (step 8.4e) leaves its
 * filters, sort and scroll as they were; a customer reached by its URL is a page with nothing read behind it.
 */
export const Route = createFileRoute("/_frame/customers")({
  validateSearch: (s: Record<string, unknown>): { segment?: string } =>
    typeof s["segment"] === "string" ? { segment: s["segment"] } : {},
  head: () => ({ meta: [{ title: "Klanten · Insyte" }] }),
  loader: async ({ context, location }) => {
    if (!atList(location.pathname)) return
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(customersAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, customersAtom)))
  },
  pendingComponent: Pending,
  component: Layout
})

const atList = (pathname: string) => pathname.replace(/\/$/, "") === "/customers"

function Layout() {
  const asModal = useOpenedAsModal()
  const atIndex = useRouterState({ select: (s) => atList(s.location.pathname) })
  return (
    <>
      {atIndex || asModal ? <CustomersRoute /> : null}
      <Outlet />
    </>
  )
}

function Pending() {
  return <PageSkeleton kind="table" title="Klanten" />
}

const isForbidden = Schema.is(Forbidden)

function CustomersRoute() {
  const result = useAtomValue(customersAtom)
  const page = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (page !== undefined) return <Loaded page={page} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de klanten niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Customers.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ page }: { page: CustomerPage }) {
  const navigate = useNavigate()
  const source = useConsoleCustomersSource(
    page,
    (row) => navigate({ to: "/customers/$customerId", params: { customerId: row.id }, state: OPEN_AS_MODAL })
  )
  return (
    <CustomersSourceProvider value={source}>
      <CustomersPage />
    </CustomersSourceProvider>
  )
}
