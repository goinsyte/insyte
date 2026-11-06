import { createFileRoute } from "@tanstack/react-router";
import { StoresPage } from "@insyte/ui/app/settings/stores-screen";

export const Route = createFileRoute("/_admin/settings/stores")({
	component: StoresPage,
});
