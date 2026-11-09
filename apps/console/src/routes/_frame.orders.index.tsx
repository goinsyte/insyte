import { createFileRoute } from "@tanstack/react-router"

/* The list is drawn by the layout (`_frame.orders.tsx`), which keeps it mounted under an open order; this route exists
   so `/orders` resolves, as in the reference. */
export const Route = createFileRoute("/_frame/orders/")({
  component: () => null
})
