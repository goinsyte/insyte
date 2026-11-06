import { createFileRoute } from "@tanstack/react-router";
import { SupplierNotifications } from "@insyte/ui/app/supplier/settings-notifications-screen";

export const Route = createFileRoute("/_supplier/supplier/settings/notifications")({
	component: SupplierNotifications,
});
