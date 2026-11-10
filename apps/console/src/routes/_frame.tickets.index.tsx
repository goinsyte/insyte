import { createFileRoute } from "@tanstack/react-router"

/* The board is drawn by the layout (`_frame.tickets.tsx`); this route exists so `/tickets` resolves, as in the
   reference. */
export const Route = createFileRoute("/_frame/tickets/")({
  component: () => null
})
