import { createFileRoute, redirect } from "@tanstack/react-router";

/*
 * A ticket's own address. It used to be a second, thinner ticket screen beside the board's modal —
 * Reassign with no handler, Resolve and Post comment that only toasted — while the modal already
 * did all three for real. The address stays, for links and pins, and opens the modal on the board.
 */
export const Route = createFileRoute("/_admin/tickets/$ticketId")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/tickets", search: { ticket: params.ticketId } });
	},
});
