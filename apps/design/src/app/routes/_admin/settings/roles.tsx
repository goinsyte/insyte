import { createFileRoute } from "@tanstack/react-router";
import type { Search } from "@insyte/ui/app/settings/roles-screen";
import { RolesPage } from "@insyte/ui/app/settings/roles-page";

export const Route = createFileRoute("/_admin/settings/roles")({
	validateSearch: (s: Record<string, unknown>): Search => ({
		role: typeof s.role === "string" ? s.role : undefined,
		verzoek: typeof s.verzoek === "string" ? s.verzoek : undefined,
		nieuw: s.nieuw === "1" || s.nieuw === 1 ? "1" : undefined,
	}),
	component: RolesPage,
});
