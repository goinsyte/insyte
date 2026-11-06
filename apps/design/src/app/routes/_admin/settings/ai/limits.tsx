import { createFileRoute } from "@tanstack/react-router";
import { LimitsPage } from "@insyte/ui/app/ai/limits-screen";

export const Route = createFileRoute("/_admin/settings/ai/limits")({
	component: LimitsPage,
});
