import { createFileRoute } from "@tanstack/react-router";
import { search } from "@insyte/ui/app/supplier/notifications-search";
import { SupplierNotificationsPage } from "@insyte/ui/app/supplier/notifications-screen";

export const Route = createFileRoute("/_supplier/supplier/notifications")({
	validateSearch: search,
	component: SupplierNotificationsPage,
});
