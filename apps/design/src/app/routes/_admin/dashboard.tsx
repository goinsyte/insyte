import { createFileRoute } from "@tanstack/react-router";
import { homeSearch } from "@insyte/ui/app/dashboard/dashboard-search";
import { DashboardPage } from "@insyte/ui/app/dashboard/dashboard-screen";

export const Route = createFileRoute("/_admin/dashboard")({
	validateSearch: homeSearch,
	component: DashboardPage,
});
