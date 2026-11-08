// The rail's and top bar's preferences over the demo's store; the logic is `navPrefsOf`.
import { navPrefsOf } from "../lib/nav-model";
import { MAX_RAIL_ADDONS, type Shortcut, type ThemeMode, useNavStore } from "../stores/nav-store";

export type { Shortcut, ThemeMode };
export { MAX_RAIL_ADDONS };

export function useNavPrefs() {
	return navPrefsOf(useNavStore());
}
