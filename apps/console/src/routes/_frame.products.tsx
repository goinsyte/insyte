import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { ProductPage } from "@insyte/modules/products/domain/Products"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { OPEN_AS_MODAL, useOpenedAsModal } from "@insyte/ui/app/common/detail-shell"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { MarginDialog } from "@insyte/ui/app/products/margin-dialog"
import { NewProductDialog } from "@insyte/ui/app/products/new-product-dialog"
import { ProductsPage } from "@insyte/ui/app/products/products-screen"
import { type ProductRow, ProductsSourceProvider } from "@insyte/ui/app/products/source"
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useMemo, useRef } from "react"
import { productsPageAtom } from "../data/products.ts"
import { viewStoreAtom } from "../data/store-view.ts"
import { storesAtom } from "../data/stores.ts"
import { suppliersAtom } from "../data/suppliers.ts"
import { ConsoleLowStock } from "../products/low-stock.tsx"
import { useProductCommands } from "../products/product-writes.ts"
import { FIRST_PRODUCTS, useConsoleProductsSource } from "../products/products-source.ts"

/**
 * Producten (step 8.4c, M6.4): the reference's products list over `Products.list`, in the frame, paged on the server
 * (W3.1; an Aandacht cut from the panel is a filter on its flag, `products-source.ts`). The loader reads the first page
 * on the server; until it is in, the reference's table skeleton stands in. A role that may not see products is
 * told which permission it misses.
 *
 * The list is this layout rather than `/products/`, as with Bestellingen, so a row opened over it (step 8.4e) leaves its
 * filters, sort and scroll as they were; a product reached by its URL is a page with nothing read behind it.
 */
/** A store a new product can go into. */
const live = (s: { readonly status: string }) => s.status === "connected" || s.status === "connecting"

export const Route = createFileRoute("/_frame/products")({
  validateSearch: (s: Record<string, unknown>): { status?: string; view?: string } => ({
    ...(typeof s["status"] === "string" ? { status: s["status"] } : {}),
    ...(typeof s["view"] === "string" ? { view: s["view"] } : {})
  }),
  head: () => ({ meta: [{ title: "Producten · Insyte" }] }),
  loader: async ({ context, location }) => {
    if (!atList(location.pathname)) return
    const atom = productsPageAtom(FIRST_PRODUCTS)
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(atom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, atom)))
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
  const result = useAtomValue(productsPageAtom(FIRST_PRODUCTS))
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

const NO_SUPPLIER = ""

/** "€" for EUR: the currency's sign as prices are written in Dutch. */
const symbolOf = (currency: string) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")
    ?.value ?? currency

function Loaded({ page }: { page: ProductPage }) {
  const navigate = useNavigate()
  const commands = useProductCommands()
  const source = useConsoleProductsSource(
    page,
    (row) => navigate({ to: "/products/$productId", params: { productId: row.id }, state: OPEN_AS_MODAL })
  )
  // "Marges herberekenen" in the design's dialog, applied by `Products.reprice` (M7.3). One component for the page's
  // life, so a refetch behind an open dialog does not remount it; it calls the latest command.
  const reprice = useRef(commands.reprice)
  reprice.current = commands.reprice
  const Margin = useMemo(
    () => (props: { open: boolean; onOpenChange: (open: boolean) => void; picked: Array<ProductRow> }) => (
      <MarginDialog
        {...props}
        onApply={(priced, target) => void reprice.current(priced, target)}
      />
    ),
    []
  )
  // The low-stock advice (M7 9.3), once Shopify reported stock for any product.
  const LowStock = page.summary?.stocked === true ? ConsoleLowStock : undefined
  // "Nieuw product" in the design's dialog, made by `Products.create` (M7.3) in the store in view (the top bar's switch)
  // when it is connected, else the first connected store the role reaches, priced in its currency; the supplier is one
  // of the workspace's, or none.
  const stores = Option.getOrUndefined(AsyncResult.value(useAtomValue(storesAtom)))
  const inView = useAtomValue(viewStoreAtom)
  const store = stores?.find((s) => s.id === inView && live(s)) ?? stores?.find(live)
  const known = Option.getOrUndefined(AsyncResult.value(useAtomValue(suppliersAtom)))?.rows
  const create = useRef(commands.create)
  create.current = commands.create
  const NewProduct = useMemo(() => {
    const names = new Map((known ?? []).map((s) => [s.id, s.name]))
    const suppliers = [NO_SUPPLIER, ...names.keys()]
    const symbol = symbolOf(store?.currency ?? "EUR")
    const storeId = store?.id
    return ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
      <NewProductDialog
        open={open}
        onOpenChange={onOpenChange}
        suppliers={suppliers}
        supplierLabel={(id) => names.get(id) ?? "Geen leverancier"}
        symbol={symbol}
        archivable={false}
        onCreate={(input) =>
          void create.current({
            storeId,
            title: input.title,
            sku: input.sku,
            price: input.price,
            cost: input.cost,
            supplierId: input.supplier === NO_SUPPLIER ? null : input.supplier,
            status: input.status,
            description: input.description
          }).then((id) => {
            if (id !== undefined) {
              void navigate({ to: "/products/$productId", params: { productId: id }, state: OPEN_AS_MODAL })
            }
          })}
      />
    )
  }, [known, store?.id, store?.currency, navigate])
  const canCreate = source.canCreate.ok && stores !== undefined && store === undefined
    ? { ok: false, reason: "Verbind eerst een winkel; daar komt het product in" }
    : source.canCreate
  return (
    <ProductsSourceProvider
      value={{ ...source, canCreate, Margin, LowStock, ...(canCreate.ok ? { NewProduct } : {}) }}
    >
      <ProductsPage />
    </ProductsSourceProvider>
  )
}
