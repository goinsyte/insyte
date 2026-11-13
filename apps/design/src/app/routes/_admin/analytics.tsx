import { createFileRoute } from "@tanstack/react-router";
import { DemoAnalyticsSource } from "@insyte/ui/app/analytics/analytics-demo-source";
import { AnalyticsPage } from "@insyte/ui/app/analytics/analytics-screen";

export const Route = createFileRoute("/_admin/analytics")({
	component: AnalyticsRoute,
});

function AnalyticsRoute() {
	return (
		<DemoAnalyticsSource>
			<AnalyticsPage />
		</DemoAnalyticsSource>
	);
}
