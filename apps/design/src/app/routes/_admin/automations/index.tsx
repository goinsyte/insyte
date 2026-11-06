import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { VIEWS } from "@insyte/ui/app/automations/automations-search";
import { AutomationsPage } from "@insyte/ui/app/automations/automations-screen";

export const Route = createFileRoute("/_admin/automations/")({
	validateSearch: z.object({ view: z.enum(VIEWS).optional() }),
	component: AutomationsPage,
});
