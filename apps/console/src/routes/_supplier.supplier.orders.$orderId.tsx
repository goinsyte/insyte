import { NotFound } from "@insyte/domain/Errors"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SupplierOrder } from "@insyte/ui/app/supplier/order-screen"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Schema } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { portalOrderAtom } from "../data/supplier-portal.ts"

const isNotFound = Schema.is(NotFound)

/** One of the supplier's orders (M16 step 2); one that is not theirs is the router's not-found. */
export const Route = createFileRoute("/_supplier/supplier/orders/$orderId")({
  head: () => ({ meta: [{ title: "Bestelling · Insyte" }] }),
  loader: async ({ context, params }) => {
    const atom = portalOrderAtom(params.orderId)
    context.registry.mount(atom)
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
    return { id: params.orderId }
  },
  pendingComponent: () => <PageSkeleton kind="document" />,
  component: SupplierOrder
})
