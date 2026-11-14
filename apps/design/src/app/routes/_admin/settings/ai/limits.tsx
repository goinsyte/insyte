import { createFileRoute } from "@tanstack/react-router";
import { DemoLimitsSource } from "@insyte/ui/app/ai/limits-demo-source";
import { LimitsPage } from "@insyte/ui/app/ai/limits-screen";

export const Route = createFileRoute("/_admin/settings/ai/limits")({
	component: () => (
		<DemoLimitsSource>
			<LimitsPage />
		</DemoLimitsSource>
	),
});
