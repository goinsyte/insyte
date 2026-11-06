import { createFileRoute } from "@tanstack/react-router";
import { TrashPage } from "@insyte/ui/app/settings/depth/trash-screen";

export const Route = createFileRoute("/_admin/settings/trash")({
	component: TrashPage,
});
