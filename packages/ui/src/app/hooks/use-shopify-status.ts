import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type ShopifyStatus = {
	connected: boolean;
	syncing: boolean;
	counts: { products: number; orders: number; customers: number };
};

/**
 * Poll the real Shopify connect + backfill status (counts climb as the worker
 * upserts; `syncing` reflects the live BullMQ job state). Used by the onboarding
 * sync step and the settings re-sync button — no fake timers.
 */
export function useShopifyStatus(pollMs = 2500): ShopifyStatus | null {
	const [status, setStatus] = useState<ShopifyStatus | null>(null);
	useEffect(() => {
		let active = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const tick = async () => {
			const { data } = await api.operators["shopify-status"].get();
			if (!active) return;
			if (data) setStatus(data);
			timer = setTimeout(tick, pollMs);
		};
		void tick();
		return () => {
			active = false;
			if (timer) clearTimeout(timer);
		};
	}, [pollMs]);
	return status;
}

/** Re-run the historical backfill for the org's connected store. */
export async function resyncShopify(): Promise<boolean> {
	const { error } = await api.operators.shopify.resync.post();
	return !error;
}
