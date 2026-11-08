import { createFileRoute } from "@tanstack/react-router";
import { DemoAgentsPage } from "@insyte/ui/app/ai/agents-page";

export const Route = createFileRoute("/_admin/settings/agents")({
	component: DemoAgentsPage,
});
