import { createFileRoute } from "@tanstack/react-router";
import { DemoApiKeysPage } from "@insyte/ui/app/settings/api-keys-page";

export const Route = createFileRoute("/_admin/settings/api-keys")({
	component: DemoApiKeysPage,
});
