import { createFileRoute } from "@tanstack/react-router";
import { ReturnsLayout } from "@insyte/ui/app/returns/returns-screen";

export const Route = createFileRoute("/_admin/returns")({
	component: ReturnsLayout,
});
