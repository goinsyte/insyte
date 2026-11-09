import { createFileRoute } from "@tanstack/react-router"

/* The list is drawn by the layout (`_frame.customers.tsx`), which keeps it mounted under an open record; this route
   exists so `/customers` resolves, as in the reference. */
export const Route = createFileRoute("/_frame/customers/")({
  component: () => null
})
