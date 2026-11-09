import { Outlet, useRouterState } from "@tanstack/react-router"
import { useOpenedAsModal } from "../common/detail-shell"
import { DemoOrdersSource } from "./demo-source"
import { OrdersList } from "./orders-screen"

/**
 * The list lives here rather than in `index.tsx`, so that opening an order does not unmount it.
 *
 * That is the whole mechanism behind the modal: the route under the overlay is the same React tree
 * it was a moment ago, with its filters, its sort and its scroll position intact, and the record is
 * a dialog on top of it. `index.tsx` renders nothing because this layout has already rendered what
 * `/orders` is.
 *
 * A record reached by URL rather than by click gets no list behind it — there is nothing to go back
 * to — so the detail renders as a page and this returns null.
 */
export function OrdersLayout() {
  const asModal = useOpenedAsModal()
  const atIndex = useRouterState({
    select: (s) => s.location.pathname.replace(/\/$/, "") === "/orders"
  })
  return (
    <>
      {atIndex || asModal ?
        (
          <DemoOrdersSource>
            <OrdersList />
          </DemoOrdersSource>
        ) :
        null}
      <Outlet />
    </>
  )
}
