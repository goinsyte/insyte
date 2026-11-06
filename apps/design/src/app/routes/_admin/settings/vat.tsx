import { createFileRoute } from "@tanstack/react-router";
import { VatPage } from "@insyte/ui/app/settings/depth/vat-screen";

export const Route = createFileRoute("/_admin/settings/vat")({
	component: VatPage,
});
