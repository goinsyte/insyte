import { createFileRoute } from "@tanstack/react-router";
import { CostsPage } from "@insyte/ui/app/costs/costs-screen";

export const Route = createFileRoute("/_admin/costs")({
	component: CostsPage,
});
