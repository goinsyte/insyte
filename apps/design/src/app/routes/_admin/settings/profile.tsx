import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsPage } from "@insyte/ui/app/settings/profile-screen";
import { DemoAccountSource } from "@insyte/ui/app/settings/workspace-demo-source";

export const Route = createFileRoute("/_admin/settings/profile")({
	component: () => (
		<DemoAccountSource>
			<AccountSettingsPage />
		</DemoAccountSource>
	),
});
