import { NotFound } from "@insyte/domain/Errors"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SupplierProduct } from "@insyte/ui/app/supplier/product-screen"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Schema } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { portalProductAtom } from "../data/supplier-portal.ts"

const isNotFound = Schema.is(NotFound)

/** One of the supplier's products (M16 step 2): its stock per variant, its lead time, what waits on it. */
export const Route = createFileRoute("/_supplier/supplier/products/$productId")({
  head: () => ({ meta: [{ title: "Product · Insyte" }] }),
  loader: async ({ context, params }) => {
    const atom = portalProductAtom(params.productId)
    context.registry.mount(atom)
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
    return { id: params.productId }
  },
  pendingComponent: () => <PageSkeleton kind="document" />,
  component: SupplierProduct
})
