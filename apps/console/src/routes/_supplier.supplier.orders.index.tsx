import { SupplierOrders } from "@insyte/ui/app/supplier/orders-screen"
import { VIEWS } from "@insyte/ui/app/supplier/orders-search"
import { createFileRoute } from "@tanstack/react-router"

/** The supplier's orders (M16 step 2), cut by view in the browser from the list the portal's layout read. */
export const Route = createFileRoute("/_supplier/supplier/orders/")({
  head: () => ({ meta: [{ title: "Bestellingen · Insyte" }] }),
  validateSearch: (s: Record<string, unknown>): { view?: (typeof VIEWS)[number] } =>
    VIEWS.includes(s["view"] as never) ? { view: s["view"] as (typeof VIEWS)[number] } : {},
  component: SupplierOrders
})
