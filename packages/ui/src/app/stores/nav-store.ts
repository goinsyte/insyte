import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "auto";
import { MAX_PINNED_FRIENDS } from "../lib/nav-limits";
import { ensureFullOrder, MAX_RAIL_ADDONS, navActions } from "../lib/nav-model";

export { MAX_PINNED_FRIENDS, MAX_RAIL_ADDONS };

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

export type NavState = {
	hidden: string[];
	order: string[];
	pinnedAddons: string[];
	pinnedFriends: string[];
	shortcuts: Record<string, Shortcut>;
	themeMode: ThemeMode;
};

export type NavActions = {
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


export const useNavStore = create<NavState & NavActions>()(
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

			...navActions(get, set),
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
