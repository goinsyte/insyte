// Backwards-compatible facade over the zustand nav store.
import { useCallback } from "react";
import {
	MAX_RAIL_ADDONS,
	type Shortcut,
	sortedRail as sortedRailUtil,
	type ThemeMode,
	useNavStore,
} from "../stores/nav-store";

export type { Shortcut, ThemeMode };
export { MAX_RAIL_ADDONS };

export function useNavPrefs() {
	const hidden = useNavStore((s) => s.hidden);
	const order = useNavStore((s) => s.order);
	const pinnedAddons = useNavStore((s) => s.pinnedAddons);
	const pinnedFriends = useNavStore((s) => s.pinnedFriends);
	const shortcuts = useNavStore((s) => s.shortcuts);
	const themeMode = useNavStore((s) => s.themeMode);

	const toggleHidden = useNavStore((s) => s.toggleHidden);
	const moveRailItem = useNavStore((s) => s.moveRailItem);
	const togglePinned = useNavStore((s) => s.togglePinned);
	const togglePinnedFriend = useNavStore((s) => s.togglePinnedFriend);
	const setShortcut = useNavStore((s) => s.setShortcut);
	const setThemeMode = useNavStore((s) => s.setThemeMode);

	const isHidden = useCallback((to: string) => hidden.includes(to), [hidden]);
	const isAddonPinned = useCallback(
		(id: string) => pinnedAddons.includes(id),
		[pinnedAddons],
	);
	const isFriendPinned = useCallback(
		(id: string) => pinnedFriends.includes(id),
		[pinnedFriends],
	);
	const pinnedCount = useCallback(
		(installedIds: string[]) =>
			pinnedAddons.filter((id) => installedIds.includes(id)).length,
		[pinnedAddons],
	);
	// Old API took (id, installedIds) and ignored installedIds in our new impl.
	const togglePinnedCompat = useCallback(
		(id: string, _installedIds: string[]) => {
			void _installedIds;
			return togglePinned(id);
		},
		[togglePinned],
	);
	const sortedRail = useCallback(
		(allKeys: string[]) =>
			order.length === 0 ? allKeys : sortedRailUtil(allKeys),
		[order],
	);

	return {
		state: {
			hidden,
			order,
			pinnedAddons,
			pinnedFriends,
			shortcuts,
			themeMode,
		},
		isHidden,
		toggleHidden,
		moveRailItem,
		sortedRail,
		isAddonPinned,
		isFriendPinned,
		pinnedCount,
		togglePinned: togglePinnedCompat,
		togglePinnedFriend,
		setShortcut,
		setThemeMode,
	};
}
