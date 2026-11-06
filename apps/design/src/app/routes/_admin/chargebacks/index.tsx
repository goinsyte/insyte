import { createFileRoute } from "@tanstack/react-router";

/* The list itself is rendered by `route.tsx`, which keeps it mounted under an open record. This
   route exists so the path resolves; what it draws is already on screen. */
export const Route = createFileRoute("/_admin/chargebacks/")({
	component: () => null,
});
