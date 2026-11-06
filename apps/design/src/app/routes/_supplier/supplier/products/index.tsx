import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { VIEWS } from "@insyte/ui/app/supplier/products-search";
import { SupplierProducts } from "@insyte/ui/app/supplier/products-screen";

export const Route = createFileRoute("/_supplier/supplier/products/")({
	validateSearch: z.object({ view: z.enum(VIEWS).optional() }),
	component: SupplierProducts,
});
