import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { forwardingPrefsSeed, forwardingSeed, SCENARIO, type Scenario } from "../../data-source";
import {
	cancel,
	confirm,
	effective,
	type ErrorReason,
	fail,
	forward,
	type ForwardPrefs,
	type ForwardVia,
	type Leg,
	legKey,
	type LegState,
	reasonOf,
	reroute,
	type SupplierSignal,
} from "../lib/forwarding";
import { workKey } from "../lib/supplier-work";
import { effectHooks } from "./agent-log-store";
import { useWorkspace } from "./workspace-store";

/*
 * The forwarding queue's legs (PLAN 24). The seeded legs come from the fixtures each load; what
 * persists is what happened to them here, by the leg's original key, so a leg sent to another
 * supplier keeps its history. The supplier's own work — accepted, shipped, a problem — is laid over
 * the leg when it is read (`useForwardLegs`), so the supplier portal and this queue cannot disagree.
 */

/** A person's send waits out the toast's window before it leaves (ADR-0023). */
export const SEND_WINDOW_MS = 6000;

type State = {
	overrides: Record<string, Leg>;
	prefs: ForwardPrefs;
	scenario: Scenario;
	/** Sends legs to their suppliers. Returns the way back, for one Undo over the batch. */
	forwardLegs: (keys: ReadonlyArray<string>, by: string, via?: Partial<Record<string, ForwardVia>>, window?: number) => () => void;
	confirmLeg: (key: string, by: string) => () => void;
	failLeg: (key: string, reason: ErrorReason, by: string, note?: string) => () => void;
	rerouteLeg: (key: string, supplierId: string, by: string) => () => void;
	cancelLeg: (key: string, by: string) => () => void;
	setPref: (supplierId: string, patch: Partial<{ via: ForwardVia; auto: boolean }>) => void;
};

const seedByKey = new Map(forwardingSeed.map((l) => [legKey(l.orderId, l.supplierId), l]));

export const useForwarding = create<State>()(
	persist(
		(set, get) => {
			const current = (key: string): Leg | undefined => get().overrides[key] ?? seedByKey.get(key);
			/** Applies `move` to each leg and returns the undo that puts every one back. */
			const apply = (keys: ReadonlyArray<string>, move: (leg: Leg) => Leg): (() => void) => {
				const before: Record<string, Leg | undefined> = {};
				const next = { ...get().overrides };
				for (const k of keys) {
					const leg = current(k);
					if (!leg) continue;
					try {
						const moved = move(leg);
						before[k] = get().overrides[k];
						next[k] = moved;
					} catch {
						// A leg that cannot make this move (already confirmed, say) is left as it is.
					}
				}
				set({ overrides: next });
				return () =>
					set((s) => {
						const o = { ...s.overrides };
						for (const [k, v] of Object.entries(before)) {
							if (v === undefined) delete o[k];
							else o[k] = v;
						}
						return { overrides: o };
					});
			};
			return {
				overrides: {},
				prefs: { ...forwardingPrefsSeed },
				scenario: SCENARIO,
				forwardLegs: (keys, by, via, window = SEND_WINDOW_MS) =>
					apply(keys, (leg) => forward(leg, Date.now(), { via: via?.[leg.supplierId] ?? get().prefs[leg.supplierId]?.via ?? "portal", by, window })),
				confirmLeg: (key, by) => apply([key], (leg) => confirm({ ...leg, state: leg.state === "sending" ? "awaiting" : leg.state }, Date.now(), by)),
				failLeg: (key, reason, by, note) => apply([key], (leg) => ({ ...fail(leg, Date.now(), reason, by), note })),
				rerouteLeg: (key, supplierId, by) => apply([key], (leg) => reroute(leg, Date.now(), supplierId, by)),
				cancelLeg: (key, by) => apply([key], (leg) => cancel(leg, Date.now(), by)),
				setPref: (supplierId, patch) =>
					set((s) => ({ prefs: { ...s.prefs, [supplierId]: { ...(s.prefs[supplierId] ?? { via: "portal" as const, auto: false }), ...patch } } })),
			};
		},
		{
			name: "insyte:forwarding:v1",
			version: 1,
			partialize: (s) => ({ overrides: s.overrides, prefs: s.prefs, scenario: s.scenario }),
			merge: (persisted, current) => {
				const p = persisted as Partial<State> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, overrides: p.overrides ?? {}, prefs: { ...current.prefs, ...p.prefs } };
			},
		},
	),
);

/** A leg as the screens read it: its effective state with the supplier's work laid over it. */
export type LegRow = Leg & { key: string; effective: LegState; reasonNow?: ErrorReason };

export function legsNow(overrides: Record<string, Leg>, work: ReturnType<typeof useWorkspace.getState>["supplierWork"], now: number): LegRow[] {
	return forwardingSeed.map((seed) => {
		const key = legKey(seed.orderId, seed.supplierId);
		const leg = overrides[key] ?? seed;
		const w = work[workKey(leg.orderId, leg.supplierId)];
		const signal: SupplierSignal | undefined = w ? { accepted: w.accepted_at !== undefined, shipped: w.parcels.length > 0, problem: w.problem?.kind } : undefined;
		return { ...leg, key, effective: effective(leg, signal, now), reasonNow: reasonOf(leg, signal) };
	});
}

/** Every leg, live. `now` should tick while a send is waiting out its window. */
export function useForwardLegs(now: number): LegRow[] {
	const overrides = useForwarding((s) => s.overrides);
	const work = useWorkspace((s) => s.supplierWork);
	// Rounded to the second, so a ticking clock does not rebuild the list more than it must.
	const sec = Math.floor(now / 1000);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `sec` stands in for `now`
	return useMemo(() => legsNow(overrides, work, sec * 1000), [overrides, work, sec]);
}

/* The agent's ForwardOrder lays its effect down here (the log store owns the undo, not the toast). */
effectHooks.forward = (effect, direction) => {
	const s = useForwarding.getState();
	const keys = effect.keys;
	if (direction === "forward") {
		const at = Date.now();
		useForwarding.setState({
			overrides: {
				...s.overrides,
				...Object.fromEntries(
					keys.flatMap((k) => {
						const leg = s.overrides[k] ?? seedByKey.get(k);
						if (!leg || (leg.state !== "to_forward" && leg.state !== "error")) return [];
						return [[k, forward(leg, at, { via: s.prefs[leg.supplierId]?.via ?? "portal", by: "Insyte", window: 0 })]];
					}),
				),
			},
		});
	} else {
		useForwarding.setState({
			overrides: Object.fromEntries(
				Object.entries(s.overrides).map(([k, l]) => (keys.includes(k) && (l.state === "sending" || l.state === "awaiting") ? [k, { ...l, state: "to_forward" as const, sendingUntil: undefined, by: undefined }] : [k, l])),
			),
		});
	}
};
