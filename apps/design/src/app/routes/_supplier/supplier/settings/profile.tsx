import { createFileRoute } from "@tanstack/react-router";
import { SupplierProfilePage } from "@insyte/ui/app/supplier/settings-profile-screen";

export const Route = createFileRoute("/_supplier/supplier/settings/profile")({
	component: SupplierProfilePage,
});
