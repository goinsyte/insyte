import { createFileRoute } from "@tanstack/react-router";
import { DemoProductDetail } from "@insyte/ui/app/products/demo-detail";
import type { ProductSearch } from "@insyte/ui/app/products/product-screen";

export const Route = createFileRoute("/_admin/products/$productId")({
	validateSearch: (s: Record<string, unknown>): ProductSearch => ({
		tab: s.tab === "quality" ? "quality" : undefined,
		check: typeof s.check === "string" ? s.check : undefined,
	}),
	component: DemoProductDetail,
});
