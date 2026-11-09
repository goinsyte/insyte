import { useAtomValue } from "@effect/atom-react"
import { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { ProductDetail as Detail } from "@insyte/modules/products/domain/Products"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { ProductDetailSourceProvider } from "@insyte/ui/app/products/detail-source"
import { ProductDetail } from "@insyte/ui/app/products/product-screen"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { productAtom, productsAtom } from "../data/products.ts"
import { storesAtom } from "../data/stores.ts"
import { arrivingProductDetail, useConsoleProductDetail } from "../products/product-detail-source.ts"

/**
 * One product (step 8.4e, M6.4): the reference's page over `Products.get`, read-only, as the order is. Reached by its
 * URL, the server reads it (and the stores, for its link into Shopify's admin) before it renders; an unknown one is
 * the router's not-found. Opened from a row, it opens at once over the list, the record's skeleton holding the body.
 */
export const Route = createFileRoute("/_frame/products/$productId")({
  head: () => ({ meta: [{ title: "Product · Insyte" }] }),
  loader: async ({ context, params }) => {
    if (typeof window !== "undefined") return
    const atom = productAtom(params.productId)
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(atom)
    context.registry.mount(storesAtom)
    const [exit] = await Effect.runPromise(
      Effect.all([
        Effect.exit(AtomRegistry.getResult(context.registry, atom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, storesAtom))
      ], { concurrency: "unbounded" })
    )
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: Pending,
  component: ProductRoute
})

function Pending() {
  return <PageSkeleton kind="document" />
}

const isForbidden = Schema.is(Forbidden)
const isNotFound = Schema.is(NotFound)

function ProductRoute() {
  const { productId } = Route.useParams()
  const result = useAtomValue(productAtom(productId))
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(productsAtom)))
  const stores = Option.getOrUndefined(AsyncResult.value(useAtomValue(storesAtom))) ?? []
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  const shopOf = (storeId: string) => stores.find((s) => s.id === storeId)?.shopDomain
  if (detail !== undefined) return <Loaded detail={detail} shopDomain={shopOf(detail.product.storeId)} />
  const failed = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  if (failed !== undefined && failed._tag === "Fail" && isNotFound(failed.error)) throw notFound()
  if (failed !== undefined && failed._tag === "Fail" && isForbidden(failed.error)) {
    return (
      <DeniedPanel
        title="Je rol kan dit product niet zien"
        denial={{
          perm: failed.error.permission as Permission,
          arg: failed.error.level as Level,
          roleLabel: failed.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Products.get"
        }}
      />
    )
  }
  const row = list?.rows.find((p) => p.id === productId)
  if (row === undefined) return <Pending />
  return (
    <ProductDetailSourceProvider value={arrivingProductDetail(row, shopOf(row.storeId))}>
      <ProductDetail />
    </ProductDetailSourceProvider>
  )
}

function Loaded({ detail, shopDomain }: { detail: Detail; shopDomain: string | undefined }) {
  return (
    <ProductDetailSourceProvider value={useConsoleProductDetail(detail, shopDomain)}>
      <ProductDetail />
    </ProductDetailSourceProvider>
  )
}
