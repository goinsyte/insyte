import { createFileRoute } from "@tanstack/react-router";
import { SupplierSettingsLayout } from "@insyte/ui/app/supplier/settings-layout";

export const Route = createFileRoute("/_supplier/supplier/settings")({
	component: SupplierSettingsLayout,
});
