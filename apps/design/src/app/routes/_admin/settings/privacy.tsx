import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@insyte/ui/app/settings/depth/privacy-screen";
import { DemoSettingsDepthSource } from "@insyte/ui/app/settings/depth/demo-source";

export const Route = createFileRoute("/_admin/settings/privacy")({
	component: () => (
		<DemoSettingsDepthSource>
			<PrivacyPage />
		</DemoSettingsDepthSource>
	),
});
