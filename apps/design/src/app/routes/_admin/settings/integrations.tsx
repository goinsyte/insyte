import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@insyte/ui/app/settings/integrations-screen";

export const Route = createFileRoute("/_admin/settings/integrations")({
	component: IntegrationsPage,
});
