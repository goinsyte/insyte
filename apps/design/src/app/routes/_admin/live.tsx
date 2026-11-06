import { createFileRoute } from "@tanstack/react-router";
import { LivePage } from "@insyte/ui/app/live/live-screen";

export const Route = createFileRoute("/_admin/live")({
	component: LivePage,
});
