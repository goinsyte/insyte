import { createFileRoute } from "@tanstack/react-router";
import { RegionalPage } from "@insyte/ui/app/settings/regional-screen";

export const Route = createFileRoute("/_admin/settings/regional")({
	component: RegionalPage,
});
