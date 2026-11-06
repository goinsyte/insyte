import { createFileRoute, notFound } from "@tanstack/react-router";
import { products as seed } from "@insyte/ui/data-source";
import { ME_SUPPLIER } from "@insyte/ui/app/lib/supplier-work";
import { SupplierProduct } from "@insyte/ui/app/supplier/product-screen";

export const Route = createFileRoute("/_supplier/supplier/products/$productId")({
	loader: ({ params }) => {
		// Only a product assigned to this supplier opens here.
		const p = seed.find((x) => x.id === params.productId);
		if (!p || p.supplier_id !== ME_SUPPLIER.id) throw notFound();
		return { id: p.id };
	},
	component: SupplierProduct,
});
