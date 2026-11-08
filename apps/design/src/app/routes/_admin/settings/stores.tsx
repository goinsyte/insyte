import { createFileRoute } from "@tanstack/react-router";
import { DemoStoresPage } from "@insyte/ui/app/settings/stores-page";

export const Route = createFileRoute("/_admin/settings/stores")({
	component: DemoStoresPage,
});
