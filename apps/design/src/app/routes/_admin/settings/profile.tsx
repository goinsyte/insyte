import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsPage } from "@insyte/ui/app/settings/profile-screen";

export const Route = createFileRoute("/_admin/settings/profile")({
	component: AccountSettingsPage,
});
