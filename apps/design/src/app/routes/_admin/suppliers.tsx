import { createFileRoute } from "@tanstack/react-router";
import { SuppliersPage } from "@insyte/ui/app/suppliers/suppliers-screen";

export const Route = createFileRoute("/_admin/suppliers")({
	component: SuppliersPage,
});
