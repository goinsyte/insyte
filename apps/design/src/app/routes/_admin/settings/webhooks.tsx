import { createFileRoute } from "@tanstack/react-router";
import { type Search, WebhooksPage } from "@insyte/ui/app/settings/webhooks-screen";

export const Route = createFileRoute("/_admin/settings/webhooks")({
	validateSearch: (s: Record<string, unknown>): Search => ({
		endpoint: typeof s.endpoint === "string" ? s.endpoint : undefined,
		levering: typeof s.levering === "string" ? s.levering : undefined,
	}),
	component: WebhooksPage,
});
