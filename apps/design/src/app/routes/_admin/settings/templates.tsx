import { createFileRoute } from "@tanstack/react-router";
import { TemplatesPage } from "@insyte/ui/app/settings/depth/templates-screen";

export const Route = createFileRoute("/_admin/settings/templates")({
	component: TemplatesPage,
});
