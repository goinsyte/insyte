import { createFileRoute } from "@tanstack/react-router";
import { ReturnDetailPage } from "@insyte/ui/app/returns/return-screen";

export const Route = createFileRoute("/_admin/returns/$returnId")({
	component: ReturnDetailPage,
});
