import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysPage } from "@insyte/ui/app/settings/api-keys-screen";

export const Route = createFileRoute("/_admin/settings/api-keys")({
	component: ApiKeysPage,
});
