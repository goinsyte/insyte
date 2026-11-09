import { createFileRoute } from "@tanstack/react-router"

/* The list is drawn by the layout (`_frame.products.tsx`), which keeps it mounted under an open record; this route
   exists so `/products` resolves, as in the reference. */
export const Route = createFileRoute("/_frame/products/")({
  component: () => null
})
