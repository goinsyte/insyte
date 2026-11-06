import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { products, qualitySeed, SCENARIO, type Scenario } from "../../data-source";
import type { Note } from "../lib/notifications";
import { type Complaint, judge, mergeComplaints, type Phase, type QualityCheck, submit } from "../lib/quality";
import { useNotifications } from "./notifications-store";
import { useReturns } from "./returns-store";

/*
 * Quality checks, complaints and product phases (PLAN 26). Persisted per browser and stamped with the
 * design state. The brand and the supplier portal read the same checks, so a request made here is
 * the supplier's to-do and a submission there is the brand's to judge, with a notification each way.
 */

type State = {
	checks: QualityCheck[];
	complaints: Complaint[];
	phases: Record<string, Phase>;
	scenario: Scenario;
	request: (draft: Omit<QualityCheck, "id" | "status" | "requestedAt">) => QualityCheck;
	cancel: (id: string) => void;
	submit: (id: string, s: NonNullable<QualityCheck["submission"]>) => () => void;
	judge: (id: string, approved: boolean, by: string, reason?: string) => () => void;
	setPhase: (productId: string, phase: Phase) => () => void;
};

const note = (n: Note) => useNotifications.setState((s) => ({ notes: [n, ...s.notes] }));
const titleOf = (productId: string) => products.find((p) => p.id === productId)?.title ?? productId;

export const useQuality = create<State>()(
	persist(
		(set, get) => {
			const patch = (id: string, change: (c: QualityCheck) => QualityCheck): (() => void) => {
				const before = get().checks.find((c) => c.id === id);
				if (!before) return () => {};
				set((s) => ({ checks: s.checks.map((c) => (c.id === id ? change(c) : c)) }));
				return () => set((s) => ({ checks: s.checks.map((c) => (c.id === id ? before : c)) }));
			};
			return {
				checks: qualitySeed.checks,
				complaints: qualitySeed.complaints,
				phases: qualitySeed.phases,
				scenario: SCENARIO,
				request: (draft) => {
					const check: QualityCheck = { ...draft, id: `qc_${Date.now().toString(36)}`, status: "requested", requestedAt: new Date().toISOString() };
					set((s) => ({ checks: [check, ...s.checks] }));
					// The supplier hears about it in its own portal.
					note({
						id: `n_${check.id}`,
						persona: "supplier",
						source: "brand",
						event: "partner.work",
						actor: { kind: "brand", brand: "northwind", name: "Northwind" },
						title: "vraagt een kwaliteitscontrole voor",
						record: titleOf(check.productId),
						detail: check.note,
						to: `/supplier/products/${check.productId}`,
						at: check.requestedAt,
						read: false,
						state: "inbox",
					});
					return check;
				},
				cancel: (id) => set((s) => ({ checks: s.checks.filter((c) => c.id !== id) })),
				submit: (id, sub) => {
					const undo = patch(id, (c) => submit(c, sub));
					note({
						id: `n_sub_${id}_${Date.now().toString(36)}`,
						persona: "admin",
						source: "supplier",
						event: "supplier.message",
						actor: { kind: "person", name: sub.by, org: "Allure Fulfillment" },
						title: "stuurde een kwaliteitscontrole in voor",
						record: titleOf(get().checks.find((c) => c.id === id)?.productId ?? ""),
						detail: `${sub.photos.length} foto's${sub.batch ? ` · batch ${sub.batch}` : ""}${sub.video ? " · video" : ""}`,
						to: `/products/${get().checks.find((c) => c.id === id)?.productId ?? ""}`,
						search: { tab: "quality", check: id },
						at: sub.at,
						read: false,
						state: "inbox",
					});
					return undo;
				},
				judge: (id, approved, by, reason) => patch(id, (c) => judge(c, approved, { at: new Date().toISOString(), by, reason })),
				setPhase: (productId, phase) => {
					const before = get().phases[productId];
					set((s) => ({ phases: { ...s.phases, [productId]: phase } }));
					return () => set((s) => ({ phases: before ? { ...s.phases, [productId]: before } : Object.fromEntries(Object.entries(s.phases).filter(([k]) => k !== productId)) }));
				},
			};
		},
		{
			name: "insyte:quality:v1",
			version: 1,
			partialize: (s) => ({ checks: s.checks, complaints: s.complaints, phases: s.phases, scenario: s.scenario }),
			merge: (persisted, current) => {
				const p = persisted as Partial<State> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, ...p };
			},
		},
	),
);

export const phaseOf = (phases: Record<string, Phase>, productId: string): Phase => phases[productId] ?? "active";
export const SOLD90 = qualitySeed.sold90;
export const THRESHOLD = qualitySeed.threshold;

/** A product's quality picture: its checks, its complaints (with new quality returns folded in), the rate and the phase. */
export function useProductQuality(productId: string) {
	const checks = useQuality((s) => s.checks);
	const complaints = useQuality((s) => s.complaints);
	const phases = useQuality((s) => s.phases);
	const returns = useReturns((s) => s.records);
	return useMemo(() => {
		const all = mergeComplaints(complaints, returns).filter((c) => c.productId === productId);
		const mine = checks.filter((c) => c.productId === productId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
		const sold = SOLD90[productId] ?? 0;
		return { checks: mine, complaints: all, phase: phaseOf(phases, productId), sold, rate: sold > 0 ? all.length / sold : 0 };
	}, [checks, complaints, phases, returns, productId]);
}

/** Every product's complaint count, for the lists and the scorecard. */
export function useAllComplaints() {
	const complaints = useQuality((s) => s.complaints);
	const returns = useReturns((s) => s.records);
	return useMemo(() => mergeComplaints(complaints, returns), [complaints, returns]);
}
