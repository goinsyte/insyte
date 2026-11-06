import { createFileRoute } from "@tanstack/react-router";
import { LogPage } from "@insyte/ui/app/settings/depth/log-screen";

export const Route = createFileRoute("/_admin/settings/log")({
	component: LogPage,
});
