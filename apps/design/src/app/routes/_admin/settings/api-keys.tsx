import { createFileRoute } from "@tanstack/react-router";
import { DemoApiKeysPage } from "@insyte/ui/app/settings/api-keys-page";

export const Route = createFileRoute("/_admin/settings/api-keys")({
	validateSearch: (s: Record<string, unknown>): { nieuw?: "agent" | undefined } => ({
		nieuw: s.nieuw === "agent" ? "agent" : undefined,
	}),
	component: DemoApiKeysPage,
});
