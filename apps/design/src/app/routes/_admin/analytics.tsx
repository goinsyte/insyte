import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@insyte/ui/app/analytics/analytics-screen";

export const Route = createFileRoute("/_admin/analytics")({
	component: AnalyticsPage,
});
