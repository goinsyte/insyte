import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SCENARIO, type Scenario, settingsDepthSeed } from "../../data-source";
import { newId } from "../lib/courses";
import { type AuditEntry, GOTO_DEFAULTS, type SettingsDepthSeed } from "../lib/settings-depth";

/*
 * Settings depth (PLAN 43), persisted per browser and stamped with the design state. `save` keeps a
 * section and writes what changed into the log, so the Logboek is the record of this store's own
 * changes as well as the seeded history; it returns the undo, which takes the log line back too.
 */

type Section = Exclude<keyof SettingsDepthSeed, "audit" | "trash">;

type State = SettingsDepthSeed & {
	scenario: Scenario;
	/** Go-to keys by action id, and whether G-then-key is on at all. */
	keys: Record<string, string>;
	gotoOn: boolean;
	save: <K extends Section>(key: K, next: SettingsDepthSeed[K], log: { who: string; page: string; to: string; changes: ReadonlyArray<[field: string, before: string, after: string]> }) => () => void;
	restore: (ids: ReadonlyArray<string>) => () => void;
	purge: (ids: ReadonlyArray<string>) => void;
	setKey: (id: string, key: string) => () => void;
	resetKeys: () => () => void;
	setGotoOn: (on: boolean) => void;
};

const DEFAULT_KEYS = Object.fromEntries(GOTO_DEFAULTS.map((g) => [g.id, g.key]));

export const useSettingsDepth = create<State>()(
	persist(
		(set, get) => ({
			...settingsDepthSeed,
			scenario: SCENARIO,
			keys: DEFAULT_KEYS,
			gotoOn: true,
			save: (key, next, log) => {
				const before = { [key]: get()[key], audit: get().audit } as Partial<State>;
				const at = new Date().toISOString();
				const lines: AuditEntry[] = log.changes.map(([field, b, a]) => ({ id: newId("a"), at, who: log.who, page: log.page, to: log.to, field, before: b || "—", after: a || "—" }));
				set({ [key]: next, audit: [...lines, ...get().audit] } as Partial<State>);
				return () => set(before);
			},
			restore: (ids) => {
				const before = get().trash;
				set({ trash: before.filter((t) => !ids.includes(t.id)) });
				return () => set({ trash: before });
			},
			purge: (ids) => set({ trash: get().trash.filter((t) => !ids.includes(t.id)) }),
			setKey: (id, key) => {
				const before = get().keys;
				set({ keys: { ...before, [id]: key } });
				return () => set({ keys: before });
			},
			resetKeys: () => {
				const before = get().keys;
				set({ keys: DEFAULT_KEYS });
				return () => set({ keys: before });
			},
			setGotoOn: (gotoOn) => set({ gotoOn }),
		}),
		{
			name: "insyte:settings-depth:v1",
			version: 1,
			partialize: (s) => ({ scenario: s.scenario, shipping: s.shipping, links: s.links, brand: s.brand, domain: s.domain, vat: s.vat, privacy: s.privacy, audit: s.audit, trash: s.trash, keys: s.keys, gotoOn: s.gotoOn }),
			merge: (persisted, current) => {
				const p = persisted as Partial<State> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, ...p, keys: { ...DEFAULT_KEYS, ...p.keys } };
			},
		},
	),
);
