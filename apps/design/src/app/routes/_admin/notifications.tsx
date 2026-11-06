import { createFileRoute } from "@tanstack/react-router";
import { search } from "@insyte/ui/app/notifications/notifications-search";
import { AdminNotifications } from "@insyte/ui/app/notifications/notifications-screen";

export const Route = createFileRoute("/_admin/notifications")({
	validateSearch: search,
	component: AdminNotifications,
});
