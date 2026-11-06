import { useEffect } from "react";
import { create } from "zustand";
import { customers } from "../../data-source";
import { products } from "../../data-source";
import { SCENARIO } from "../../data-source";
import { useHome } from "./home-store";

/*
 * The orders arriving while the home is open. Shopify is not connected in this repo, so they are
 * simulated: every 20 to 30 seconds one more order lands at the head of the ticker, drawn from the
 * catalogue and the customers the workspace already has. They live here and not in the workspace on
 * purpose — the workspace's dated widgets read a window ending at its latest order, and a live order
 * dated today would empty every one of them.
 *
 * The clock that says "Bijgewerkt zojuist" lives here too: a refresh is when the board last read
 * the workspace, and with auto refresh on it does so every minute and lets the ticker run.
 */

export type LiveOrder = {
	id: string;
	number: string;
	customer: string;
	country: string;
	productId: string;
	title: string;
	image?: string;
	qty: number;
	/** In USD, the catalogue's currency; the widget converts to the board's. */
	total: number;
	at: number;
};

type LiveState = {
	orders: LiveOrder[];
	paused: boolean;
	refreshedAt: number;
	refreshing: boolean;
	setPaused: (p: boolean) => void;
	arrive: () => void;
	refresh: () => void;
};

let seq = 0;

function make(i: number, at: number): LiveOrder | null {
	const product = products[(i * 7 + 3) % Math.max(1, products.length)];
	const customer = customers[(i * 5 + 2) % Math.max(1, customers.length)];
	if (!product || !customer) return null;
	const qty = (i % 3) + 1;
	seq += 1;
	return {
		id: `live_${seq}`,
		number: `SO-${12460 + seq}`,
		customer: customer.name,
		country: customer.address?.country ?? "NL",
		productId: product.id,
		title: product.title,
		image: product.images[0],
		qty,
		total: Math.round(product.price * qty * 100) / 100,
		at,
	};
}

const seed = (): LiveOrder[] => {
	if (SCENARIO === "empty") return [];
	const minutes = [3, 11, 19, 34, 52, 71, 96, 128];
	return minutes.map((m, i) => make(i, Date.now() - m * 60_000)).filter((o): o is LiveOrder => o !== null);
};

export const useLive = create<LiveState>()((set, get) => ({
	orders: seed(),
	paused: false,
	refreshedAt: Date.now(),
	refreshing: false,
	setPaused: (paused) => set({ paused }),
	arrive: () => {
		const next = make(seq + 11, Date.now());
		if (next) set((s) => ({ orders: [next, ...s.orders].slice(0, 40) }));
	},
	refresh: () => {
		if (get().refreshing) return;
		set({ refreshing: true });
		window.setTimeout(() => set({ refreshing: false, refreshedAt: Date.now() }), 650);
	},
}));

/**
 * Runs the board's clock while the home is open: a new order every 20 to 30 seconds and a refresh
 * every minute, both only while auto refresh is on. Pausing the ticker stops the orders, not the
 * refresh.
 */
export function useLiveFeed() {
	const auto = useHome((s) => s.autoRefresh);
	const paused = useLive((s) => s.paused);
	useEffect(() => {
		if (!auto || SCENARIO === "empty") return;
		const t = window.setInterval(() => useLive.getState().refresh(), 60_000);
		return () => window.clearInterval(t);
	}, [auto]);
	useEffect(() => {
		if (!auto || paused || SCENARIO === "empty") return;
		let timer = 0;
		const next = () => {
			timer = window.setTimeout(() => {
				useLive.getState().arrive();
				next();
			}, 20_000 + Math.random() * 10_000);
		};
		next();
		return () => window.clearTimeout(timer);
	}, [auto, paused]);
}
