import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Group } from "../lib/filter";

/*
 * Saved views: a named filter on one list, kept so the operator can come back to "Delayed at Linyi"
 * without building it again. Keyed by the list ("orders", "tickets", "queue"), persisted per
 * browser, and pinnable — a pinned view is a row in the area panel's Pinned list.
 *
 * `active` is which view each list is showing. It lives here rather than in the URL because the
 * sidebar sets it before it navigates, and a list opened from anywhere else starts where it was left.
 */

export type SavedView = { id: string; name: string; filter: Group; pinned: boolean };

type ViewsState = {
	views: Record<string, SavedView[]>;
	active: Record<string, string | null>;
	/** The working filter per list, so moving away and back keeps what was being built. */
	draft: Record<string, Group>;
	save: (key: string, name: string, filter: Group) => string;
	update: (key: string, id: string, filter: Group) => void;
	rename: (key: string, id: string, name: string) => void;
	remove: (key: string, id: string) => SavedView | undefined;
	restore: (key: string, view: SavedView) => void;
	togglePin: (key: string, id: string) => void;
	setActive: (key: string, id: string | null) => void;
	setDraft: (key: string, filter: Group) => void;
};

export const useViews = create<ViewsState>()(
	persist(
		(set, get) => ({
			views: {},
			active: {},
			draft: {},
			save: (key, name, filter) => {
				const id = `v${Date.now().toString(36)}`;
				set((s) => ({
					views: { ...s.views, [key]: [...(s.views[key] ?? []), { id, name, filter, pinned: false }] },
					active: { ...s.active, [key]: id },
				}));
				return id;
			},
			update: (key, id, filter) =>
				set((s) => ({ views: { ...s.views, [key]: (s.views[key] ?? []).map((v) => (v.id === id ? { ...v, filter } : v)) } })),
			rename: (key, id, name) =>
				set((s) => ({ views: { ...s.views, [key]: (s.views[key] ?? []).map((v) => (v.id === id ? { ...v, name } : v)) } })),
			remove: (key, id) => {
				const gone = (get().views[key] ?? []).find((v) => v.id === id);
				set((s) => ({
					views: { ...s.views, [key]: (s.views[key] ?? []).filter((v) => v.id !== id) },
					active: { ...s.active, [key]: s.active[key] === id ? null : (s.active[key] ?? null) },
				}));
				return gone;
			},
			restore: (key, view) => set((s) => ({ views: { ...s.views, [key]: [...(s.views[key] ?? []), view] } })),
			togglePin: (key, id) =>
				set((s) => ({
					views: { ...s.views, [key]: (s.views[key] ?? []).map((v) => (v.id === id ? { ...v, pinned: !v.pinned } : v)) },
				})),
			setActive: (key, id) => set((s) => ({ active: { ...s.active, [key]: id } })),
			setDraft: (key, filter) => set((s) => ({ draft: { ...s.draft, [key]: filter } })),
		}),
		{ name: "insyte:views:v1", version: 1 },
	),
);

/* One empty filter for every list that has none, so a selector reading it returns the same object
   each time and a subscriber does not re-render on nothing. */
const NO_FILTER: Group = { kind: "group", id: "root", join: "and", children: [] };

/** The filter a list should show: the draft being built, else its active view's, else nothing. */
export function currentFilter(s: Pick<ViewsState, "views" | "active" | "draft">, key: string): Group {
	const id = s.active[key];
	const view = id ? s.views[key]?.find((v) => v.id === id) : undefined;
	return s.draft[key] ?? view?.filter ?? NO_FILTER;
}
