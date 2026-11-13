import { createFileRoute } from "@tanstack/react-router";
import { DemoLiveSource } from "@insyte/ui/app/live/live-demo-source";
import { LivePage } from "@insyte/ui/app/live/live-screen";

export const Route = createFileRoute("/_admin/live")({
	component: () => (
		<DemoLiveSource>
			<LivePage />
		</DemoLiveSource>
	),
});
