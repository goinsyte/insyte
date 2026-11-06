import { createFileRoute } from "@tanstack/react-router";
import { NotificationSettings } from "@insyte/ui/app/settings/notifications-screen";

export const Route = createFileRoute("/_admin/settings/notifications")({
	component: NotificationSettings,
});
