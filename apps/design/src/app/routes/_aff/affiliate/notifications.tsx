import { createFileRoute } from "@tanstack/react-router";
import { search } from "@insyte/ui/app/affiliate/notifications-search";
import { AffiliateNotificationsPage } from "@insyte/ui/app/affiliate/notifications-screen";

export const Route = createFileRoute("/_aff/affiliate/notifications")({
	validateSearch: search,
	component: AffiliateNotificationsPage,
});
