import { createFileRoute } from "@tanstack/react-router";
import { AgentsPage } from "@insyte/ui/app/ai/agents-screen";

export const Route = createFileRoute("/_admin/settings/agents")({
	component: AgentsPage,
});
