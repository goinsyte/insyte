import { createFileRoute } from "@tanstack/react-router";
import { VatPage } from "@insyte/ui/app/settings/depth/vat-screen";
import { DemoSettingsDepthSource } from "@insyte/ui/app/settings/depth/demo-source";

export const Route = createFileRoute("/_admin/settings/vat")({
	component: () => (
		<DemoSettingsDepthSource>
			<VatPage />
		</DemoSettingsDepthSource>
	),
});
