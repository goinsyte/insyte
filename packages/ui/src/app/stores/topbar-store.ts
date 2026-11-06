import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MAX_SHORTCUTS = 3;

export type TopbarShortcut = {
	id: string;
	label: string;
	to: string;
	icon?: string;
};

type State = {
	shortcuts: TopbarShortcut[];
	activeStoreId: string;
};

type Actions = {
	addShortcut: (shortcut: TopbarShortcut) => boolean;
	removeShortcut: (id: string) => void;
	setActiveStore: (id: string) => void;
};

const DEFAULT_SHORTCUTS: TopbarShortcut[] = [
	{ id: "sc-orders", label: "Bestellingen", to: "/orders", icon: "shopping-bag" },
	{ id: "sc-inbox", label: "Inbox", to: "/inbox", icon: "inbox" },
];

export const useTopbarStore = create<State & Actions>()(
	persist(
		(set, get) => ({
			shortcuts: DEFAULT_SHORTCUTS,
			// Reconciled against the live store list in use-active-store; empty
			// until the user picks one (or it defaults to the first real store).
			activeStoreId: "",

			addShortcut: (shortcut) => {
				const current = get().shortcuts;
				if (current.length >= MAX_SHORTCUTS) return false;
				if (current.some((s) => s.to === shortcut.to)) return false;
				set({ shortcuts: [...current, shortcut] });
				return true;
			},

			removeShortcut: (id) =>
				set({ shortcuts: get().shortcuts.filter((s) => s.id !== id) }),

			setActiveStore: (id) => set({ activeStoreId: id }),
		}),
		{
			name: "insyte:topbar:v3",
			version: 4,
			// Version 4 is the console in Dutch: a saved shortcut to a default destination takes its Dutch label.
			migrate: (old, version) => {
				const s = old as Partial<State>;
				if (version < 4 && s.shortcuts) {
					return {
						...s,
						shortcuts: s.shortcuts.map((sc) => {
							const d = DEFAULT_SHORTCUTS.find((x) => x.to === sc.to);
							return d ? { ...sc, label: d.label } : sc;
						}),
					} as State;
				}
				return s as State;
			},
		},
	),
);
