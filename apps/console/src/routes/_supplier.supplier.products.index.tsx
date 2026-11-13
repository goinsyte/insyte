import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SupplierProducts } from "@insyte/ui/app/supplier/products-screen"
import { VIEWS } from "@insyte/ui/app/supplier/products-search"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { portalProductsAtom } from "../data/supplier-portal.ts"

/** The supplier's products (M16 step 2): what the brand sells of theirs, with its stock and lead time. */
export const Route = createFileRoute("/_supplier/supplier/products/")({
  head: () => ({ meta: [{ title: "Producten · Insyte" }] }),
  validateSearch: (s: Record<string, unknown>): { view?: (typeof VIEWS)[number] } =>
    VIEWS.includes(s["view"] as never) ? { view: s["view"] as (typeof VIEWS)[number] } : {},
  loader: async ({ context }) => {
    context.registry.mount(portalProductsAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, portalProductsAtom)))
  },
  pendingComponent: () => <PageSkeleton kind="table" title="Producten" />,
  component: SupplierProducts
})
