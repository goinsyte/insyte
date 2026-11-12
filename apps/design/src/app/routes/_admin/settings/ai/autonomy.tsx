import { createFileRoute } from "@tanstack/react-router";
import { DemoAutonomySource } from "@insyte/ui/app/ai/autonomy-demo-source";
import { type AutonomySearch, AutonomyPage } from "@insyte/ui/app/ai/autonomy-screen";

export const Route = createFileRoute("/_admin/settings/ai/autonomy")({
	validateSearch: (s: Record<string, unknown>): AutonomySearch => ({ actie: typeof s.actie === "string" ? s.actie : undefined }),
	component: () => (
		<DemoAutonomySource>
			<AutonomyPage />
		</DemoAutonomySource>
	),
});
