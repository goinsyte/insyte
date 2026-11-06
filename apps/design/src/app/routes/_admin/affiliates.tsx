import { createFileRoute } from "@tanstack/react-router";
import { type View, VIEWS } from "@insyte/ui/app/affiliates/affiliates-search";
import { AffiliatesPage } from "@insyte/ui/app/affiliates/affiliates-screen";

export const Route = createFileRoute("/_admin/affiliates")({
	validateSearch: (s: Record<string, unknown>): { view?: View } => ({ view: VIEWS.includes(s.view as View) ? (s.view as View) : undefined }),
	component: AffiliatesPage,
});
