import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@insyte/ui/app/settings/team-screen";

export const Route = createFileRoute("/_admin/settings/team")({
	component: TeamPage,
});
