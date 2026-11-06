import { createFileRoute } from "@tanstack/react-router";
import { KnowledgePage } from "@insyte/ui/app/ai/knowledge-screen";

export const Route = createFileRoute("/_admin/settings/ai/knowledge/")({
	component: KnowledgePage,
});
