import { getRouteApi } from "@tanstack/react-router";
import { NotificationsPage } from "../notifications/notifications-page";

const Route = getRouteApi("/_aff/affiliate/notifications");

export function AffiliateNotificationsPage() {
	const { view, source } = Route.useSearch();
	return <NotificationsPage persona="affiliate" base="/affiliate/notifications" settingsTo="/affiliate/settings/profile" view={view} source={source} />;
}
