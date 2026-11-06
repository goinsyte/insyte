import { createFileRoute } from "@tanstack/react-router";
import { BrandPage } from "@insyte/ui/app/settings/depth/brand-screen";

export const Route = createFileRoute("/_admin/settings/brand")({
	component: BrandPage,
});
