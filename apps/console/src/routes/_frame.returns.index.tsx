import { createFileRoute } from "@tanstack/react-router"

/* The list is drawn by the layout (`_frame.returns.tsx`), which keeps it mounted under an open return; this route exists
   so `/returns` resolves, as in the reference. */
export const Route = createFileRoute("/_frame/returns/")({
  component: () => null
})
