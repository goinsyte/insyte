import { createFileRoute } from "@tanstack/react-router";
import { DemoTicketsSource } from "@insyte/ui/app/tickets/demo-source";
import { ticketsSearch } from "@insyte/ui/app/tickets/tickets-search";
import { TicketsPage } from "@insyte/ui/app/tickets/tickets-screen";

export const Route = createFileRoute("/_admin/tickets/")({
	validateSearch: ticketsSearch,
	component: () => (
		<DemoTicketsSource>
			<TicketsPage />
		</DemoTicketsSource>
	),
});
