import { createFileRoute } from "@tanstack/react-router";
import { type ActivitySearch, ActivityPage } from "@insyte/ui/app/ask/activity-screen";

export const Route = createFileRoute("/_admin/ask/activity")({
	validateSearch: (s: Record<string, unknown>): ActivitySearch => ({
		view: typeof s.view === "string" ? s.view : undefined,
		row: typeof s.row === "string" ? s.row : undefined,
	}),
	component: ActivityPage,
});
