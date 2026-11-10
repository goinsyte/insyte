import { createFileRoute } from "@tanstack/react-router";
import { DemoReturnsSource } from "@insyte/ui/app/returns/demo-source";
import { ReturnSettingsPage } from "@insyte/ui/app/returns/settings-screen";

export const Route = createFileRoute("/_admin/settings/returns")({
	component: () => (
		<DemoReturnsSource>
			<ReturnSettingsPage />
		</DemoReturnsSource>
	),
});
