import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SCENARIO, type Scenario, sheetsSeed } from "../../data-source";
import { newId } from "../lib/courses";
import { type TemplateId, templateTabs } from "../lib/sheet-templates";
import type { Folder, Sheet, Tab } from "../lib/sheets";

/*
 * Rekenbladen (PLAN 40): folders and sheets, persisted per browser and stamped with the design
 * state. Cell edits go through `setTabs`, which the editor calls with the whole tab list so its
 * own undo stack can put any earlier state back; the rest return their undo like every store.
 */

export type SheetsState = {
	scenario: Scenario;
	folders: Folder[];
	sheets: Sheet[];
	create: (title: string, template: TemplateId, by: string, folderId?: string) => Sheet;
	importRows: (title: string, rows: string[][], by: string) => Sheet;
	setTabs: (id: string, tabs: Tab[]) => void;
	patch: (ids: ReadonlyArray<string>, patch: Partial<Pick<Sheet, "title" | "folderId" | "pinned" | "archived" | "shared">>) => () => void;
	duplicate: (id: string, by: string) => Sheet | undefined;
	remove: (ids: ReadonlyArray<string>) => () => void;
	open: (id: string) => void;
	addFolder: (name: string) => { id: string; undo: () => void };
};

const now = () => new Date().toISOString();

export const useSheets = create<SheetsState>()(
	persist(
		(set, get) => {
			const swap = (before: Sheet[]) => () => set({ sheets: before });
			const put = (s: Sheet) => set((st) => ({ sheets: [s, ...st.sheets] }));
			return {
				scenario: SCENARIO,
				folders: sheetsSeed.folders,
				sheets: sheetsSeed.sheets,
				create: (title, template, by, folderId) => {
					const s: Sheet = { id: newId("sh"), title, folderId, pinned: false, archived: false, ownerId: by, shared: [], createdAt: now(), updatedAt: now(), openedAt: now(), tabs: templateTabs(template, newId) };
					put(s);
					return s;
				},
				importRows: (title, rows, by) => {
					const cells: Tab["cells"] = {};
					rows.slice(0, 40).forEach((row, r) =>
						row.slice(0, 12).forEach((v, c) => {
							if (v.trim()) cells[`${String.fromCharCode(65 + c)}${r + 1}`] = { v: v.trim(), ...(r === 0 ? { bold: true } : {}) };
						}),
					);
					const s: Sheet = { id: newId("sh"), title, pinned: false, archived: false, ownerId: by, shared: [], createdAt: now(), updatedAt: now(), openedAt: now(), tabs: [{ id: newId("tab"), name: "Import", cells, widths: {} }] };
					put(s);
					return s;
				},
				setTabs: (id, tabs) => set((st) => ({ sheets: st.sheets.map((s) => (s.id === id ? { ...s, tabs, updatedAt: now() } : s)) })),
				patch: (ids, p) => {
					const before = get().sheets;
					set({ sheets: before.map((s) => (ids.includes(s.id) ? { ...s, ...p } : s)) });
					return swap(before);
				},
				duplicate: (id, by) => {
					const src = get().sheets.find((s) => s.id === id);
					if (!src) return undefined;
					const copy: Sheet = { ...src, id: newId("sh"), title: `${src.title} (kopie)`, ownerId: by, shared: [], pinned: false, archived: false, createdAt: now(), updatedAt: now(), openedAt: now(), tabs: src.tabs.map((t) => ({ ...t, id: newId("tab") })) };
					put(copy);
					return copy;
				},
				remove: (ids) => {
					const before = get().sheets;
					set({ sheets: before.filter((s) => !ids.includes(s.id)) });
					return swap(before);
				},
				open: (id) => set((st) => ({ sheets: st.sheets.map((s) => (s.id === id ? { ...s, openedAt: now() } : s)) })),
				addFolder: (name) => {
					const before = get().folders;
					const id = newId("fld");
					set({ folders: [...before, { id, name }] });
					return { id, undo: () => set({ folders: before }) };
				},
			};
		},
		{
			name: "insyte:sheets:v1",
			version: 1,
			partialize: (s) => ({ scenario: s.scenario, folders: s.folders, sheets: s.sheets }),
			merge: (persisted, current) => {
				const p = persisted as Partial<SheetsState> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, ...p };
			},
		},
	),
);
