import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { VIEWS } from "@insyte/ui/app/supplier/orders-search";
import { SupplierOrders } from "@insyte/ui/app/supplier/orders-screen";

export const Route = createFileRoute("/_supplier/supplier/orders/")({
	validateSearch: z.object({ view: z.enum(VIEWS).optional() }),
	component: SupplierOrders,
});
