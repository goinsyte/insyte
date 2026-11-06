import { create } from "zustand";

/*
 * What the Data hub holds that nothing else does: the CSV files imported this session, and when each
 * store last synced. Nothing leaves the browser; a sync is a progress bar at a believable pace.
 */

export type ImportBatch = {
	id: string;
	fileName: string;
	header: string[];
	rows: string[][];
	at: string;
};

export type StoreSync = {
	syncedAt?: string;
	/** 0–100 while a sync runs, undefined otherwise. */
	progress?: number;
	records?: number;
};

type State = {
	batches: ImportBatch[];
	syncs: Record<string, StoreSync>;
	addBatch: (batch: Omit<ImportBatch, "id" | "at">) => ImportBatch;
	removeBatch: (id: string) => (() => void) | undefined;
	syncStore: (storeId: string, records: number) => Promise<void>;
};

const SEED_SYNCS: Record<string, StoreSync> = {
	store_us: { syncedAt: "2026-10-27T08:12:00Z" },
	store_eu: { syncedAt: "2026-10-27T07:48:00Z" },
};

export const useImports = create<State>()((set, get) => ({
	batches: [],
	syncs: SEED_SYNCS,
	addBatch: (draft) => {
		const batch: ImportBatch = {
			...draft,
			id: `imp_${Date.now().toString(36)}`,
			at: new Date().toISOString(),
		};
		set((s) => ({ batches: [batch, ...s.batches] }));
		return batch;
	},
	removeBatch: (id) => {
		const index = get().batches.findIndex((b) => b.id === id);
		const batch = get().batches[index];
		if (!batch) return undefined;
		set((s) => ({ batches: s.batches.filter((b) => b.id !== id) }));
		return () =>
			set((s) => {
				const next = [...s.batches];
				next.splice(index, 0, batch);
				return { batches: next };
			});
	},
	syncStore: async (storeId, records) => {
		if (get().syncs[storeId]?.progress !== undefined) return;
		const patch = (p: StoreSync) =>
			set((s) => ({ syncs: { ...s.syncs, [storeId]: { ...s.syncs[storeId], ...p } } }));
		patch({ progress: 0 });
		// Ten ticks of uneven size, about two seconds in all.
		for (let i = 1; i <= 10; i++) {
			await new Promise((resolve) => setTimeout(resolve, 140 + ((i * 37) % 90)));
			patch({ progress: Math.min(100, i * 10) });
		}
		patch({ progress: undefined, syncedAt: new Date().toISOString(), records });
	},
}));

/** Reads a CSV: quoted fields, doubled quotes inside them, and CRLF or LF line ends. */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
	const out: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (ch === '"') {
				quoted = false;
			} else {
				cell += ch;
			}
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ",") {
			row.push(cell);
			cell = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(cell);
			out.push(row);
			row = [];
			cell = "";
		} else {
			cell += ch;
		}
	}
	if (cell !== "" || row.length > 0) {
		row.push(cell);
		out.push(row);
	}
	const lines = out.filter((r) => r.some((c) => c.trim() !== ""));
	const [header = [], ...rows] = lines;
	return { header: header.map((h) => h.trim()), rows };
}
