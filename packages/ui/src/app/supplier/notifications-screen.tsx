import { getRouteApi } from "@tanstack/react-router";
import { NotificationsPage } from "../notifications/notifications-page";

const Route = getRouteApi("/_supplier/supplier/notifications");

export function SupplierNotificationsPage() {
	const { view, source } = Route.useSearch();
	return <NotificationsPage persona="supplier" base="/supplier/notifications" settingsTo="/supplier/settings/notifications" view={view} source={source} />;
}
