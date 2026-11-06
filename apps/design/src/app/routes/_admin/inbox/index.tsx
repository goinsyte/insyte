import { createFileRoute } from "@tanstack/react-router";
import { inboxSearch } from "@insyte/ui/app/inbox/inbox-search";
import { InboxPage } from "@insyte/ui/app/inbox/inbox-screen";

export const Route = createFileRoute("/_admin/inbox/")({
	validateSearch: inboxSearch,
	component: InboxPage,
});
