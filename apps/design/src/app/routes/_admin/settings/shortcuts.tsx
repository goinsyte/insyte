import { createFileRoute } from "@tanstack/react-router";
import { ShortcutsPage } from "@insyte/ui/app/settings/depth/shortcuts-screen";

export const Route = createFileRoute("/_admin/settings/shortcuts")({
	component: ShortcutsPage,
});
