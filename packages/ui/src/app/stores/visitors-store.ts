import { useEffect } from "react";
import { create } from "zustand";
import { products, SCENARIO } from "../../data-source";
import { useLive } from "./live-store";

/*
 * Who is on the store right now (PLAN 41). Shopify's live view is not connected in this repo, so the
 * visitors are simulated, like the home's order ticker: someone arrives every few seconds from one of
 * the cities Northwind sells to, looks at a product, and sometimes puts it in the cart, checks out
 * and buys. Nothing is stored; a visitor exists while the page is open, as on the real thing.
 */

import type { Stage } from "../live/live-source";

export type { Stage } from "../live/live-source";
export { STAGE_LABEL } from "../live/live-source";
export type Source = "Meta ads" | "Google" | "Klaviyo" | "Instagram" | "Direct";

export type Visitor = {
	id: string;
	city: string;
	country: string;
	lon: number;
	lat: number;
	source: Source;
	device: "mobiel" | "desktop";
	stage: Stage;
	page: string;
	value: number;
	arrivedAt: number;
	movedAt: number;
	returning: boolean;
};

export type LiveEvent = { id: string; at: number; kind: "arrive" | Stage | "leave"; visitor: Visitor; amount?: number; order?: string };


const CITIES: ReadonlyArray<readonly [string, string, number, number, number]> = [
	["Amsterdam", "Nederland", 4.9, 52.37, 9],
	["Rotterdam", "Nederland", 4.48, 51.92, 6],
	["Utrecht", "Nederland", 5.12, 52.09, 5],
	["Eindhoven", "Nederland", 5.47, 51.44, 3],
	["Groningen", "Nederland", 6.57, 53.22, 2],
	["Antwerpen", "België", 4.4, 51.22, 4],
	["Gent", "België", 3.72, 51.05, 2],
	["Berlijn", "Duitsland", 13.4, 52.52, 5],
	["Hamburg", "Duitsland", 9.99, 53.55, 3],
	["München", "Duitsland", 11.58, 48.14, 3],
	["Keulen", "Duitsland", 6.96, 50.94, 2],
	["Parijs", "Frankrijk", 2.35, 48.86, 4],
	["Lyon", "Frankrijk", 4.84, 45.76, 1],
	["Londen", "Verenigd Koninkrijk", -0.13, 51.51, 5],
	["Manchester", "Verenigd Koninkrijk", -2.24, 53.48, 2],
	["Madrid", "Spanje", -3.7, 40.42, 2],
	["Milaan", "Italië", 9.19, 45.46, 1],
	["Stockholm", "Zweden", 18.07, 59.33, 1],
	["Kopenhagen", "Denemarken", 12.57, 55.68, 1],
	["New York", "Verenigde Staten", -74.0, 40.71, 6],
	["Los Angeles", "Verenigde Staten", -118.24, 34.05, 4],
	["Chicago", "Verenigde Staten", -87.63, 41.88, 3],
	["Austin", "Verenigde Staten", -97.74, 30.27, 2],
	["Seattle", "Verenigde Staten", -122.33, 47.61, 2],
	["Toronto", "Canada", -79.38, 43.65, 2],
	["Sydney", "Australië", 151.21, -33.87, 1],
];
const SOURCES: ReadonlyArray<readonly [Source, number]> = [
	["Meta ads", 5],
	["Google", 3],
	["Instagram", 2],
	["Klaviyo", 2],
	["Direct", 3],
];
const PAGES = ["Homepagina", "Collectie jassen", "Nieuw binnen", "Sale"];

function pick<T>(xs: ReadonlyArray<T>, weight: (x: T) => number): T {
	let r = Math.random() * xs.reduce((n, x) => n + weight(x), 0);
	for (const x of xs) {
		r -= weight(x);
		if (r <= 0) return x;
	}
	return xs[0]!;
}

let seq = 0;
let orderSeq = 12600;

function visitor(at: number, stage: Stage = "browsing"): Visitor {
	const [city, country, lon, lat] = pick(CITIES, (c) => c[4]);
	const [source] = pick(SOURCES, (x) => x[1]);
	const product = products.length ? products[Math.floor(Math.random() * products.length)] : undefined;
	const onProduct = !!product && Math.random() < 0.7;
	seq += 1;
	return {
		id: `v_${seq}`,
		city,
		country,
		lon: lon + (Math.random() - 0.5) * 1.6,
		lat: lat + (Math.random() - 0.5) * 1.2,
		source,
		device: Math.random() < 0.68 ? "mobiel" : "desktop",
		stage,
		page: onProduct ? product.title : PAGES[Math.floor(Math.random() * PAGES.length)]!,
		value: product ? Math.round(product.price * (1 + Math.floor(Math.random() * 2)) * 100) / 100 : 0,
		arrivedAt: at,
		movedAt: at,
		returning: Math.random() < 0.3,
	};
}

type State = {
	visitors: Visitor[];
	events: LiveEvent[];
	paused: boolean;
	/** Revenue today before the page was opened: the orders the ticker already has from today. */
	base: number;
	setPaused: (p: boolean) => void;
	tick: () => void;
};

const ev = (kind: LiveEvent["kind"], v: Visitor, at: number, extra: Partial<LiveEvent> = {}): LiveEvent => ({ id: `e_${seq++}`, at, kind, visitor: v, ...extra });

function seed(): Pick<State, "visitors" | "events" | "base"> {
	if (SCENARIO === "empty") return { visitors: [], events: [], base: 0 };
	const now = Date.now();
	const stages: Stage[] = ["browsing", "browsing", "browsing", "browsing", "browsing", "browsing", "browsing", "browsing", "browsing", "cart", "cart", "cart", "checkout", "browsing"];
	const visitors = stages.map((s, i) => {
		const v = visitor(now - (i * 47 + 20) * 1000, s);
		return { ...v, movedAt: now - i * 23_000 };
	});
	const events: LiveEvent[] = [];
	for (let i = 0; i < 10; i++) {
		const v = visitor(now - (i + 1) * 61_000);
		const kind = i % 4 === 1 ? "bought" : i % 3 === 0 ? "cart" : "arrive";
		events.push(ev(kind, v, now - (i + 1) * 61_000, kind === "bought" ? { amount: v.value, order: `SO-${orderSeq++}` } : {}));
	}
	const today = new Date().setHours(0, 0, 0, 0);
	const base = useLive.getState().orders.filter((o) => o.at >= today).reduce((n, o) => n + o.total, 0) + events.filter((e) => e.kind === "bought").reduce((n, e) => n + (e.amount ?? 0), 0);
	return { visitors, events, base };
}

export const useVisitors = create<State>()((set, get) => ({
	...seed(),
	paused: false,
	setPaused: (paused) => set({ paused }),
	tick: () => {
		const now = Date.now();
		const out: LiveEvent[] = [];
		let base = get().base;
		const next: Visitor[] = [];
		for (const v of get().visitors) {
			const age = now - v.movedAt;
			if (v.stage === "bought") {
				if (age < 14_000) next.push(v);
				continue;
			}
			const r = Math.random();
			if (v.stage === "browsing" && r < 0.06) {
				const moved = { ...v, stage: "cart" as const, movedAt: now };
				out.push(ev("cart", moved, now));
				next.push(moved);
			} else if (v.stage === "cart" && r < 0.18) {
				const moved = { ...v, stage: "checkout" as const, movedAt: now };
				out.push(ev("checkout", moved, now));
				next.push(moved);
			} else if (v.stage === "checkout" && r < 0.32) {
				const moved = { ...v, stage: "bought" as const, movedAt: now };
				const order = `SO-${orderSeq++}`;
				base += v.value;
				out.push(ev("bought", moved, now, { amount: v.value, order }));
				next.push(moved);
			} else if ((v.stage === "browsing" && age > 60_000 && r < 0.1) || (v.stage !== "browsing" && age > 90_000 && r < 0.08)) {
				out.push(ev("leave", v, now));
			} else next.push(v);
		}
		const want = 10 + Math.round(6 * Math.sin(now / 90_000));
		if (next.length < want + 6 && Math.random() < (next.length < want ? 0.8 : 0.35)) {
			const v = visitor(now);
			next.push(v);
			out.push(ev("arrive", v, now));
		}
		set((s) => ({ visitors: next, base, events: [...out.filter((e) => e.kind !== "leave").reverse(), ...s.events].slice(0, 60) }));
	},
}));

/** Runs the visitors while the live page is open. */
export function useVisitorFeed() {
	const paused = useVisitors((s) => s.paused);
	useEffect(() => {
		if (paused || SCENARIO === "empty") return;
		const t = window.setInterval(() => useVisitors.getState().tick(), 2_200);
		return () => window.clearInterval(t);
	}, [paused]);
}
