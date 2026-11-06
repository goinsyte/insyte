import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Customer, Order, Product } from "../lib/types/domain";
import { applyCustomerEdits, applyProductEdits, useWorkspace } from "../stores/workspace-store";

/**
 * Client-side fetch of the org's Shopify mirror for the operator list screens.
 * CSR (no SSR loader) — the session cookie rides along via the Eden client's
 * `credentials: "include"`. Each screen swaps its mock import for one of these
 * and keeps its existing filter/paginate logic.
 *
 * No cast: each call only type-checks if the Eden response shape is assignable
 * to the screen's domain type, so a server-side drift breaks the build. The
 * server's operator routes return the matching literal unions to satisfy this.
 */
function useList<T>(load: () => Promise<{ data: T[] | null }>): {
	data: T[];
	loading: boolean;
} {
	const [data, setData] = useState<T[]>([]);
	const [loading, setLoading] = useState(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: load is a stable bound api method; fetch once on mount.
	useEffect(() => {
		let active = true;
		load()
			.then((r) => {
				if (active && r.data) setData(r.data);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);
	return { data, loading };
}

/** Orders are the workspace's: a refund or a cancel on the detail screen has to show on the list. */
export const useOrders = (): { data: Order[]; loading: boolean } => ({
	data: useWorkspace((s) => s.orders),
	loading: false,
});
/* Records made in this session sit at the head of the API's lists. */
export const useProducts = () => {
	const list = useList<Product>(() => api.operators.products.get());
	const created = useWorkspace((s) => s.createdProducts);
	const edits = useWorkspace((s) => s.productEdits);
	const data = useMemo(() => applyProductEdits([...created, ...list.data], edits), [created, list.data, edits]);
	return { ...list, data };
};
export const useCustomers = () => {
	const list = useList<Customer>(() => api.operators.customers.get());
	const created = useWorkspace((s) => s.createdCustomers);
	const edits = useWorkspace((s) => s.customerEdits);
	const data = useMemo(() => applyCustomerEdits([...created, ...list.data], edits), [created, list.data, edits]);
	return { ...list, data };
};

/**
 * Single product by id (detail screen). Client-side like the lists so the
 * session cookie rides along; refetches when `id` changes. `data` is null while
 * loading and stays null on a 404 — the screen renders a not-found state.
 */
export function useProduct(id: string): {
	data: Product | null;
	loading: boolean;
} {
	const created = useWorkspace((s) => s.createdProducts.find((p) => p.id === id));
	const edit = useWorkspace((s) => s.productEdits[id]);
	const fetched = useItem((id2) => api.operators.products({ id: id2 }).get(), id);
	const base = created ?? fetched.data;
	const data = useMemo(() => (base && edit ? (applyProductEdits([base], { [base.id]: edit })[0] ?? base) : base), [base, edit]);
	return { data, loading: created ? false : fetched.loading };
}

/** Generic single-resource fetch keyed by id (detail screens). */
function useItem<T>(
	load: (id: string) => Promise<{ data: T | null }>,
	id: string,
): { data: T | null; loading: boolean } {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: load is a stable bound api method; refetch keyed on id.
	useEffect(() => {
		let active = true;
		setLoading(true);
		load(id)
			.then((r) => {
				if (active) setData(r.data ?? null);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [id]);
	return { data, loading };
}

// ── stores + dashboard metrics ───────────────────────────────────────────────
type ApiStore = NonNullable<
	Awaited<ReturnType<typeof api.operators.stores.get>>["data"]
>[number];
type Metrics = NonNullable<
	Awaited<ReturnType<typeof api.operators.metrics.get>>["data"]
>;

/** The org's connected Shopify stores (org/store switcher). */
export const useStores = () =>
	useList<ApiStore>(() => api.operators.stores.get());

/** Aggregated dashboard metrics for a window; refetches when `range` changes. */
export const useMetrics = (range: string) =>
	useItem<Metrics>(
		() => api.operators.metrics.get({ query: { range } }),
		range,
	);
