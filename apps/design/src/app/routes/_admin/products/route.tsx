import { createFileRoute } from "@tanstack/react-router";
import { ProductsLayout } from "@insyte/ui/app/products/products-layout";

export const Route = createFileRoute("/_admin/products")({
	component: ProductsLayout,
});
