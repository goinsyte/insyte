import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "auto";
export const MAX_RAIL_ADDONS = 4;
export const MAX_PINNED_FRIENDS = 4;

// Seeded with the four extensions that ship as installed in mock-data so the
// rail's sticky-apps section reads as populated on first visit. Operators can
// pin/unpin from the Manage popup.
const DEFAULT_PINNED_ADDONS = [
	"ext_klaviyo",
	"ext_gorgias",
	"ext_aftership",
	"ext_recharge",
];

// Default colleagues pinned to the topbar — taken from members.ts so the
// People tab starts populated.
const DEFAULT_PINNED_FRIENDS = [
	"mem_sofia",
	"mem_ethan",
	"mem_liam",
	"mem_maya",
];

export type Shortcut = { mod: string; key: string };

type State = {
	hidden: string[];
	order: string[];
	pinnedAddons: string[];
	pinnedFriends: string[];
	shortcuts: Record<string, Shortcut>;
	themeMode: ThemeMode;
};

type Actions = {
	toggleHidden: (to: string) => void;
	/** The whole rail order at once, for a drag. */
	setOrder: (order: string[]) => void;
	moveRailItem: (
		to: string,
		direction: "up" | "down",
		allKeys: string[],
	) => void;
	togglePinned: (id: string) => boolean;
	togglePinnedFriend: (id: string) => boolean;
	setShortcut: (to: string, shortcut: Shortcut | null) => void;
	setThemeMode: (mode: ThemeMode) => void;
};

function ensureFullOrder(saved: string[], all: string[]) {
	const result: string[] = [];
	for (const k of saved) if (all.includes(k)) result.push(k);
	for (const k of all) if (!result.includes(k)) result.push(k);
	return result;
}

export const useNavStore = create<State & Actions>()(
	persist(
		(set, get) => ({
			hidden: [],
			order: [],
			pinnedAddons: DEFAULT_PINNED_ADDONS,
			pinnedFriends: DEFAULT_PINNED_FRIENDS,
			shortcuts: {
				"/tickets": { mod: "⌘", key: "T" },
				"/inbox": { mod: "⌘", key: "E" },
			},
			themeMode: "light",

			toggleHidden: (to) => {
				const next = get().hidden.includes(to)
					? get().hidden.filter((x) => x !== to)
					: [...get().hidden, to];
				set({ hidden: next });
			},

			setOrder: (order) => set({ order }),

			moveRailItem: (to, direction, allKeys) => {
				const order = get().order;
				const current =
					order.length === 0 ? [...allKeys] : ensureFullOrder(order, allKeys);
				const idx = current.indexOf(to);
				if (idx === -1) return;
				const swap = direction === "up" ? idx - 1 : idx + 1;
				if (swap < 0 || swap >= current.length) return;
				const next = [...current];
				[next[idx], next[swap]] = [next[swap], next[idx]];
				set({ order: next });
			},

			togglePinned: (id) => {
				const current = get().pinnedAddons;
				const has = current.includes(id);
				if (has) {
					set({ pinnedAddons: current.filter((x) => x !== id) });
					return true;
				}
				if (current.length >= MAX_RAIL_ADDONS) return false;
				set({ pinnedAddons: [...current, id] });
				return true;
			},

			togglePinnedFriend: (id) => {
				const current = get().pinnedFriends;
				const has = current.includes(id);
				if (has) {
					set({ pinnedFriends: current.filter((x) => x !== id) });
					return true;
				}
				if (current.length >= MAX_PINNED_FRIENDS) return false;
				set({ pinnedFriends: [...current, id] });
				return true;
			},

			setShortcut: (to, shortcut) => {
				const next = { ...get().shortcuts };
				if (shortcut === null) delete next[to];
				else next[to] = shortcut;
				set({ shortcuts: next });
			},

			setThemeMode: (themeMode) => set({ themeMode }),
		}),
		{
			name: "insyte:nav-prefs:v6",
			version: 6,
		},
	),
);

export function sortedRail(allKeys: string[]) {
	const order = useNavStore.getState().order;
	if (order.length === 0) return allKeys;
	return ensureFullOrder(order, allKeys);
}
