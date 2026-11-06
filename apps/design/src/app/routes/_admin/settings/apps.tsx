import { createFileRoute } from "@tanstack/react-router";
import { SettingsAppsPage } from "@insyte/ui/app/settings/apps-screen";

export const Route = createFileRoute("/_admin/settings/apps")({
	component: SettingsAppsPage,
});
