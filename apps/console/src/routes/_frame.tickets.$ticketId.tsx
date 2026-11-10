import { createFileRoute, redirect } from "@tanstack/react-router"

/* A ticket's own address, for links and pins: the board with the ticket open over it, as in the reference. */
export const Route = createFileRoute("/_frame/tickets/$ticketId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/tickets", search: { ticket: params.ticketId } })
  }
})
