import { createFileRoute } from "@tanstack/react-router";
import { ApiConnection } from "@insyte/ui/app/supplier/settings-api-connection-screen";

export const Route = createFileRoute("/_supplier/supplier/settings/api-connection")({
	component: ApiConnection,
});
