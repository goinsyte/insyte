import { createFileRoute } from "@tanstack/react-router";

/* The list is rendered by `route.tsx`, which keeps it mounted under an open return. */
export const Route = createFileRoute("/_admin/returns/")({
	validateSearch: (s: Record<string, unknown>): { view?: string } => ({ view: typeof s.view === "string" ? s.view : undefined }),
	component: () => null,
});
