import { undoable } from "./undo";
import { useWorkspace } from "../stores/workspace-store";

type Collections = {
	orders: ReturnType<typeof useWorkspace.getState>["orders"];
	chargebacks: ReturnType<typeof useWorkspace.getState>["chargebacks"];
	tickets: ReturnType<typeof useWorkspace.getState>["tickets"];
};

/**
 * One change to several records, taken back with one Undo.
 *
 * The selection bar's actions all come here, so "mark 6 orders fulfilled" restores all six rows as
 * they were — not six toasts, and not an undo that only knows about the last one.
 */
export function patchMany<K extends keyof Collections>(
	key: K,
	ids: ReadonlyArray<string>,
	patch: (row: Collections[K][number]) => Collections[K][number],
	message: string,
) {
	const chosen = new Set(ids);
	const before = new Map<string, Collections[K][number]>();
	useWorkspace.setState((s) => {
		const rows = s[key] as Collections[K];
		return {
			[key]: rows.map((r) => {
				if (!chosen.has(r.id)) return r;
				before.set(r.id, r);
				return patch(r as Collections[K][number]);
			}),
		} as Partial<ReturnType<typeof useWorkspace.getState>>;
	});
	undoable(message, () =>
		useWorkspace.setState((s) => ({
			[key]: (s[key] as Collections[K]).map((r) => before.get(r.id) ?? r),
		}) as Partial<ReturnType<typeof useWorkspace.getState>>),
	);
}

export { copyLines, counted, exportCsv } from "./bulk-io";

