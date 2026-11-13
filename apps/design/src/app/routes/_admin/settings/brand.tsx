import { createFileRoute } from "@tanstack/react-router";
import { BrandPage } from "@insyte/ui/app/settings/depth/brand-screen";
import { DemoSettingsDepthSource } from "@insyte/ui/app/settings/depth/demo-source";

export const Route = createFileRoute("/_admin/settings/brand")({
	component: () => (
		<DemoSettingsDepthSource>
			<BrandPage />
		</DemoSettingsDepthSource>
	),
});
