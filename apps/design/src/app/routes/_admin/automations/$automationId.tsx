import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { workflowStore } from "@insyte/ui/app/automations/workflow-store";
import { TABS } from "@insyte/ui/app/automations/automation-search";
import { AutomationDetail } from "@insyte/ui/app/automations/automation-screen";

export const Route = createFileRoute("/_admin/automations/$automationId")({
	validateSearch: z.object({ tab: z.enum(TABS).optional(), run: z.string().optional() }),
	component: AutomationDetail,
	// Drafts made in this session live only in the store, so the store is what says it exists.
	loader: ({ params }) => {
		if (!workflowStore.getWorkflow(params.automationId)) throw notFound();
	},
});
