import { useCallback } from "react";
import type { Group } from "../lib/filter";
import { currentFilter, useViews } from "../stores/views-store";

/**
 * The filter one list is showing, and the ways to change it. Kept in the views store per list, so a
 * filter survives moving to another screen and back, and a view the sidebar opened is already
 * applied when the list mounts.
 */
export function useListFilter(key: string): {
	filter: Group;
	setFilter: (g: Group) => void;
	saveView: (name: string) => void;
} {
	const filter = useViews((s) => currentFilter(s, key));
	const setDraft = useViews((s) => s.setDraft);
	const save = useViews((s) => s.save);
	const setFilter = useCallback((g: Group) => setDraft(key, g), [key, setDraft]);
	const saveView = useCallback((name: string) => void save(key, name, filter), [key, save, filter]);
	return { filter, setFilter, saveView };
}
