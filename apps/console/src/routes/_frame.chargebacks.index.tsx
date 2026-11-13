import { createFileRoute } from "@tanstack/react-router"

/* The list is drawn by the layout (`_frame.chargebacks.tsx`), which keeps it mounted under an open case; this route
   exists so `/chargebacks` resolves, as in the reference. */
export const Route = createFileRoute("/_frame/chargebacks/")({
  component: () => null
})
