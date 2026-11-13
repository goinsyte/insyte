import { createFileRoute } from "@tanstack/react-router";
import { LogPage } from "@insyte/ui/app/settings/depth/log-screen";
import { DemoLogSource } from "@insyte/ui/app/settings/log-demo-source";

export const Route = createFileRoute("/_admin/settings/log")({
	component: () => (
		<DemoLogSource>
			<LogPage />
		</DemoLogSource>
	),
});
