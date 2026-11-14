import { useMemo } from "react";
import { returnRate } from "../lib/returns";
import { useReturns } from "../stores/returns-store";
import { useWorkspace } from "../stores/workspace-store";
import { reasonLabel } from "./parts";
import { ProductReturnsPanel } from "./product-returns-panel";

/** What came back of one product: the share of units sold, and why, from the returns queue (§1 → §3). */
export function useProductReturns(productId: string) {
	const records = useReturns((s) => s.records);
	const reasons = useReturns((s) => s.settings.reasons);
	const orders = useWorkspace((s) => s.orders);
	return useMemo(() => {
		const sold = orders.reduce((n, o) => n + o.line_items.filter((l) => l.product_id === productId).reduce((m, l) => m + l.quantity, 0), 0);
		const mine = records.filter((r) => r.status !== "rejected" && r.items.some((i) => i.productId === productId));
		const returned = mine.reduce((n, r) => n + r.items.filter((i) => i.productId === productId).reduce((m, i) => m + i.qty, 0), 0);
		const by = new Map<string, number>();
		for (const r of mine) by.set(r.reason, (by.get(r.reason) ?? 0) + 1);
		const quality = mine.filter((r) => r.quality).length;
		return {
			sold,
			returned,
			rate: returnRate(returned, sold),
			quality,
			records: mine,
			reasons: [...by.entries()].toSorted((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, label: reasonLabel(reasons, id), n })),
		};
	}, [records, reasons, orders, productId]);
}

/** The product page's Retouren block: the rate against the 10% the Aandacht view watches, and the reasons. */
export function ProductReturns({ productId }: { productId: string }) {
	return <ProductReturnsPanel r={useProductReturns(productId)} />;
}
