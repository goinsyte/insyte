import { createFileRoute } from "@tanstack/react-router";
import { ReturnSettingsPage } from "@insyte/ui/app/returns/settings-screen";

export const Route = createFileRoute("/_admin/settings/returns")({
	component: ReturnSettingsPage,
});
