import { create } from "zustand";
import { persist } from "zustand/middleware";
import { customerAgentSeed, SCENARIO, type Scenario } from "../../data-source";
import type { CustomerAgentSettings } from "../lib/customer-agent";

/*
 * The customer agent's settings (PLAN 28), persisted per browser and stamped with the design state.
 * Saving returns the way back, for the unsaved bar's Undo.
 */

type State = {
	settings: CustomerAgentSettings;
	scenario: Scenario;
	save: (next: CustomerAgentSettings) => () => void;
};

export const useCustomerAgent = create<State>()(
	persist(
		(set, get) => ({
			settings: customerAgentSeed.settings,
			scenario: SCENARIO,
			save: (next) => {
				const before = get().settings;
				set({ settings: next });
				return () => set({ settings: before });
			},
		}),
		{
			name: "insyte:customer-agent:v1",
			version: 1,
			partialize: (s) => ({ settings: s.settings, scenario: s.scenario }),
			merge: (persisted, current) => {
				const p = persisted as Partial<State> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, settings: { ...current.settings, ...p.settings } };
			},
		},
	),
);

export const AGENT_TODAY = customerAgentSeed.today;
