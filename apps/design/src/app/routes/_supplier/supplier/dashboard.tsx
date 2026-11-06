import { createFileRoute } from "@tanstack/react-router";
import { SupplierDashboard } from "@insyte/ui/app/supplier/dashboard-screen";

export const Route = createFileRoute("/_supplier/supplier/dashboard")({
	component: SupplierDashboard,
});
