import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import type { Group, Op } from "../lib/filter";
import { useViews } from "../stores/views-store";

/*
 * The area panel's cuts — "Delayed", "VIP", "Won" — are links with a search param. A list reads its
 * param here and turns it into the same filter the builder writes, so a cut is visible as chips and
 * can be edited, saved as a view, or cleared like any other. The filter it writes has the root id
 * "cut"; following a link with no param clears a cut, and leaves a filter the operator built alone.
 */
export function useSearchCut(
	key: string,
	param: string,
	cuts: Record<string, { field: string; values?: ReadonlyArray<string>; op?: Op }>,
) {
	const value = useRouterState({ select: (s) => (s.location.search as Record<string, unknown>)[param] });
	const setDraft = useViews((s) => s.setDraft);
	const setActive = useViews((s) => s.setActive);

	useEffect(() => {
		const current = useViews.getState().draft[key];
		const cut = typeof value === "string" ? cuts[value] : undefined;
		if (cut) {
			const filter: Group = {
				kind: "group",
				id: "cut",
				join: "and",
				children: [{ kind: "rule", id: `cut-${param}-${String(value)}`, field: cut.field, op: cut.op ?? "any", value: cut.values ?? [] }],
			};
			setActive(key, null);
			setDraft(key, filter);
		} else if (current?.id === "cut") {
			setDraft(key, { kind: "group", id: "root", join: "and", children: [] });
		}
		// The cut table is a constant per screen; the param is what changes.
		// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	}, [value, key, param, setDraft, setActive]);
}
