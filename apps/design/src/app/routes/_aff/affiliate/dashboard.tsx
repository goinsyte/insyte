import { createFileRoute } from "@tanstack/react-router";
import { AffiliateDashboard } from "@insyte/ui/app/affiliate/dashboard-screen";

export const Route = createFileRoute("/_aff/affiliate/dashboard")({
	component: AffiliateDashboard,
});
