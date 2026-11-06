import { create } from "zustand";
import { persist } from "zustand/middleware";
import { costsSeed, SCENARIO, type Scenario } from "../../data-source";
import type { CostLine } from "../lib/costs";

/*
 * Costs (PLAN 42), persisted per browser and stamped with the design state. Every change returns
 * the undo that puts exactly that back.
 */

type State = {
	scenario: Scenario;
	lines: CostLine[];
	add: (line: CostLine) => () => void;
	update: (id: string, patch: Partial<CostLine>) => () => void;
	remove: (id: string) => () => void;
};

export const useCosts = create<State>()(
	persist(
		(set, get) => {
			const swap = (before: CostLine[]) => () => set({ lines: before });
			return {
				scenario: SCENARIO,
				lines: costsSeed.lines,
				add: (line) => {
					const before = get().lines;
					set({ lines: [...before, line] });
					return swap(before);
				},
				update: (id, patch) => {
					const before = get().lines;
					set({ lines: before.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
					return swap(before);
				},
				remove: (id) => {
					const before = get().lines;
					set({ lines: before.filter((l) => l.id !== id) });
					return swap(before);
				},
			};
		},
		{
			name: "insyte:costs:v1",
			version: 1,
			partialize: (s) => ({ scenario: s.scenario, lines: s.lines }),
			merge: (persisted, current) => {
				const p = persisted as Partial<State> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, ...p };
			},
		},
	),
);
