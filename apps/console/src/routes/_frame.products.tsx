import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { ProductPage } from "@insyte/modules/products/domain/Products"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { OPEN_AS_MODAL, useOpenedAsModal } from "@insyte/ui/app/common/detail-shell"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { ProductsPage } from "@insyte/ui/app/products/products-screen"
import { ProductsSourceProvider } from "@insyte/ui/app/products/source"
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { productsAtom } from "../data/products.ts"
import { useConsoleProductsSource } from "../products/products-source.ts"

/**
 * Producten (step 8.4c, M6.4): the reference's products list over `Products.list`, in the frame. The loader reads them
 * on the server; until they are in, the reference's table skeleton stands in. A role that may not see products is
 * told which permission it misses.
 *
 * The list is this layout rather than `/products/`, as with Bestellingen, so a row opened over it (step 8.4e) leaves its
 * filters, sort and scroll as they were; a product reached by its URL is a page with nothing read behind it.
 */
export const Route = createFileRoute("/_frame/products")({
  validateSearch: (s: Record<string, unknown>): { status?: string; view?: string } => ({
    ...(typeof s["status"] === "string" ? { status: s["status"] } : {}),
    ...(typeof s["view"] === "string" ? { view: s["view"] } : {})
  }),
  head: () => ({ meta: [{ title: "Producten · Insyte" }] }),
  loader: async ({ context, location }) => {
    if (!atList(location.pathname)) return
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(productsAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, productsAtom)))
  },
  pendingComponent: Pending,
  component: Layout
})

const atList = (pathname: string) => pathname.replace(/\/$/, "") === "/products"

function Layout() {
  const asModal = useOpenedAsModal()
  const atIndex = useRouterState({ select: (s) => atList(s.location.pathname) })
  return (
    <>
      {atIndex || asModal ? <ProductsRoute /> : null}
      <Outlet />
    </>
  )
}

function Pending() {
  return <PageSkeleton kind="table" title="Producten" />
}

const isForbidden = Schema.is(Forbidden)

function ProductsRoute() {
  const result = useAtomValue(productsAtom)
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
        title="Je rol kan de producten niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Products.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ page }: { page: ProductPage }) {
  const navigate = useNavigate()
  const source = useConsoleProductsSource(
    page,
    (row) => navigate({ to: "/products/$productId", params: { productId: row.id }, state: OPEN_AS_MODAL })
  )
  return (
    <ProductsSourceProvider value={source}>
      <ProductsPage />
    </ProductsSourceProvider>
  )
}
