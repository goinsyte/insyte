import { byScenario } from "../../data-source";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/*
 * What the area panel keeps for the operator: records they pinned, the ones they favourited, the
 * ones they opened recently, and which week's report card they already put away. Persisted per
 * browser, like the board, because these are the operator's own shortcuts.
 *
 * Saved views that are pinned live with the views (`views-store.ts`); the panel lists both.
 */

export type ShortcutKind = "order" | "customer" | "chargeback" | "product" | "automation" | "supplier" | "store";
export type Shortcut = { to: string; label: string; kind: ShortcutKind; /** When it was opened, for Recent. */ at?: number };

const SEED_PINNED: Shortcut[] = [
	{ to: "/chargebacks/cb_2214", label: "DSP-2214 · Klarna", kind: "chargeback" },
	{ to: "/orders/ord_5024", label: "Bestelling SO-12224", kind: "order" },
];

const SEED_FAVOURITES: Shortcut[] = [
	{ to: "/orders", label: "Linyi Logistics", kind: "supplier" },
	{ to: "/orders", label: "Allure Fulfilment", kind: "supplier" },
	{ to: "/settings/stores", label: "Northwind EU", kind: "store" },
];

/* What a normal Tuesday's operator had open this morning, so Recent is not empty on the first look. */
const seedRecent = (): Shortcut[] => {
	const ago = (m: number) => Date.now() - m * 60_000;
	return [
		{ to: "/chargebacks/cb_2214", label: "DSP-2214", kind: "chargeback", at: ago(12) },
		{ to: "/orders/ord_5018", label: "Bestelling SO-12218", kind: "order", at: ago(38) },
		{ to: "/customers/cust_1000", label: "Daniel Brown", kind: "customer", at: ago(64) },
		{ to: "/products/prod_2000", label: "Aurora fleece met capuchon", kind: "product", at: ago(97) },
		{ to: "/automations/auto_1", label: "Vertraagde bestelling → e-mail + ticket", kind: "automation", at: ago(140) },
		{ to: "/orders/ord_5031", label: "Bestelling SO-12231", kind: "order", at: ago(205) },
	];
};

export type PinsState = {
	pinned: Shortcut[];
	favourites: Shortcut[];
	recent: Shortcut[];
	/** The ISO week whose report card was dismissed. */
	reportDismissed: string | null;
	unpin: (to: string, label: string) => void;
	repin: (s: Shortcut) => void;
	favourite: (s: Shortcut) => void;
	unfavourite: (to: string, label: string) => void;
	visit: (s: Shortcut) => void;
	dismissReport: (week: string | null) => void;
};

export const usePins = create<PinsState>()(
	persist(
		(set) => ({
			pinned: byScenario({ empty: [], settled: SEED_PINNED }),
			favourites: byScenario({ empty: [], settled: SEED_FAVOURITES }),
			recent: byScenario({ empty: [], settled: seedRecent() }),
			reportDismissed: null,
			unpin: (to, label) => set((s) => ({ pinned: s.pinned.filter((p) => !(p.to === to && p.label === label)) })),
			repin: (p) => set((s) => ({ pinned: [...s.pinned.filter((x) => !(x.to === p.to && x.label === p.label)), p] })),
			favourite: (f) => set((s) => ({ favourites: [...s.favourites.filter((x) => !(x.to === f.to && x.label === f.label)), f] })),
			unfavourite: (to, label) => set((s) => ({ favourites: s.favourites.filter((f) => !(f.to === to && f.label === label)) })),
			visit: (v) => set((s) => ({ recent: [{ ...v, at: Date.now() }, ...s.recent.filter((r) => r.to !== v.to)].slice(0, 6) })),
			dismissReport: (week) => set({ reportDismissed: week }),
		}),
		{
			name: "insyte:pins:v1",
			version: 4,
			// Version 1 seeded pins that opened the list instead of the record they named. Version 3 is the
			// console in Dutch: the seeded pins and the recent list carried English labels.
			migrate: (old, version) => {
				const s = old as Partial<PinsState>;
				if (version < 3) return { ...s, pinned: SEED_PINNED, favourites: SEED_FAVOURITES, recent: seedRecent() } as PinsState;
				// Version 4 seeds Recent, which the home now shows, when nothing has been opened yet.
				if (version < 4 && (s.recent ?? []).length === 0) return { ...s, recent: byScenario({ empty: [], settled: seedRecent() }) } as PinsState;
				return s as PinsState;
			},
		},
	),
);
