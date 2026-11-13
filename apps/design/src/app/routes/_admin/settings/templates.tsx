import { createFileRoute } from "@tanstack/react-router";
import { TemplatesPage } from "@insyte/ui/app/settings/depth/templates-screen";
import { DemoSettingsDepthSource } from "@insyte/ui/app/settings/depth/demo-source";

export const Route = createFileRoute("/_admin/settings/templates")({
	component: () => (
		<DemoSettingsDepthSource>
			<TemplatesPage />
		</DemoSettingsDepthSource>
	),
});
