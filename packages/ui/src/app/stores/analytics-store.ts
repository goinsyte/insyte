import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Month } from "../lib/analytics/engine";
import type { HistOrder } from "../lib/analytics/history";

/**
 * Analytics: the periods and what was decided on Insyte's proposals persist in this browser; the
 * number being explained lives only as long as the page.
 */

/** A number taken apart in the side drawer. */
export type Explanation = {
	title: string;
	value: string;
	compare?: string;
	text: string;
	drivers: Array<{ label: string; value: number; detail?: string }>;
	unit: "$" | "orders" | "pts" | "refunds" | "cases" | "h";
	records: HistOrder[];
	open?: { label: string; to: "/orders" | "/tickets" | "/chargebacks"; search?: Record<string, string> };
};

type State = {
	a: Month;
	b: Month;
	/** What was decided on a finding's proposal, by period and finding. */
	decided: Record<string, "filed" | "discarded">;
	explaining: Explanation | null;
	setPeriods: (a: Month, b: Month) => void;
	decide: (key: string, d: "filed" | "discarded" | null) => void;
	explain: (e: Explanation | null) => void;
};

export const useAnalytics = create<State>()(
	persist(
		(set) => ({
			a: "2026-05",
			b: "2026-04",
			decided: {},
			explaining: null,
			setPeriods: (a, b) => set({ a, b }),
			decide: (key, d) =>
				set((s) => {
					const { [key]: _old, ...rest } = s.decided;
					return { decided: d === null ? rest : { ...rest, [key]: d } };
				}),
			explain: (explaining) => set({ explaining }),
		}),
		{
			name: "insyte.analytics",
			version: 2,
			migrate: (old) => {
				const o = (old ?? {}) as Partial<State>;
				return { a: o.a ?? "2026-05", b: o.b ?? "2026-04", decided: o.decided ?? {} } as State;
			},
			partialize: (s) => ({ a: s.a, b: s.b, decided: s.decided }),
		},
	),
);
