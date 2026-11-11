import { createFileRoute } from "@tanstack/react-router";
import { RegionalPage } from "@insyte/ui/app/settings/regional-screen";
import { DemoRegionalSource } from "@insyte/ui/app/settings/workspace-demo-source";

export const Route = createFileRoute("/_admin/settings/regional")({
	component: () => (
		<DemoRegionalSource>
			<RegionalPage />
		</DemoRegionalSource>
	),
});
