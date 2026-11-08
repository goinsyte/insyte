import { create } from "zustand";
import { persist } from "zustand/middleware";
import { returnSettingsSeed, returnsSeed, SCENARIO, type Scenario } from "../../data-source";
import {
	amountOf,
	approvedStatus,
	type Carrier,
	move,
	type Resolution,
	RESOLUTION_LABEL,
	type ReturnEvent,
	type ReturnRecord,
	type ReturnSettings,
	type ReturnStatus,
	reviewDeadline,
} from "../lib/returns";
import { useNotifications } from "./notifications-store";
import { effectHooks } from "./agent-log-store";

/*
 * The returns queue and its settings (PLAN 25). Persisted per browser and stamped with the design
 * state, like the other stores that hold records the operator changes. Every action that can be
 * taken back returns its way back; a refund cannot, and its caller asks first.
 */

export type ReturnsState = {
	records: ReturnRecord[];
	settings: ReturnSettings;
	scenario: Scenario;
	/** Makes a return (from the portal, or started by the operator for a shopper). */
	create: (draft: Omit<ReturnRecord, "id" | "number" | "createdAt" | "deadline" | "events" | "status" | "tags" | "quality"> & Partial<Pick<ReturnRecord, "tags" | "quality">>, by: ReturnEvent) => ReturnRecord;
	approve: (ids: ReadonlyArray<string>, by: string, keepItem?: boolean) => () => void;
	reject: (ids: ReadonlyArray<string>, reason: string, by: string) => () => void;
	sendLabel: (ids: ReadonlyArray<string>, by: string, carrier?: Carrier) => () => void;
	advance: (id: string, to: ReturnStatus, event: ReturnEvent) => () => void;
	resolve: (id: string, kind: Resolution, amount: number, by: string, replacementOrder?: string) => () => void;
	assign: (ids: ReadonlyArray<string>, memberId: string | undefined, by: string) => () => void;
	note: (id: string, event: ReturnEvent) => () => void;
	saveSettings: (next: ReturnSettings) => () => void;
};

const now = () => new Date().toISOString();

/** A tracking number in the carrier's own format, so a label reads like one. */
function tracking(carrier: Carrier, n: number) {
	const tail = String(1000000 + ((n * 7919) % 8999999));
	return carrier === "PostNL" ? `3SNWD00${tail}` : carrier === "DHL" ? `JJD0003900${tail}` : carrier === "DPD" ? `0522294${tail}` : `1Z999AA1${tail}`;
}

export const useReturns = create<ReturnsState>()(
	persist(
		(set, get) => {
			/** Changes some records and returns the undo that puts exactly those back. */
			const patch = (ids: ReadonlyArray<string>, change: (r: ReturnRecord) => ReturnRecord | null): (() => void) => {
				const before = new Map<string, ReturnRecord>();
				set((s) => ({
					records: s.records.map((r) => {
						if (!ids.includes(r.id)) return r;
						try {
							const next = change(r);
							if (!next) return r;
							before.set(r.id, r);
							return next;
						} catch {
							return r;
						}
					}),
				}));
				return () => set((s) => ({ records: s.records.map((r) => before.get(r.id) ?? r) }));
			};
			const ev = (text: string, name: string, who: ReturnEvent["who"] = "team"): ReturnEvent => ({ at: now(), who, name, text });
			return {
				records: returnsSeed,
				settings: returnSettingsSeed,
				scenario: SCENARIO,
				create: (draft, by) => {
					const n = Math.max(1042, ...get().records.map((r) => Number(r.number.slice(2)) || 0)) + 1;
					const createdAt = now();
					const reason = get().settings.reasons.find((x) => x.id === draft.reason);
					const record: ReturnRecord = {
						tags: [],
						quality: reason?.quality ?? false,
						...draft,
						id: `ret_${n}`,
						number: `R-${n}`,
						status: "review",
						createdAt,
						deadline: reviewDeadline(createdAt),
						events: [by],
					};
					set((s) => ({ records: [record, ...s.records] }));
					// The returns team hears about it: here, the person at the desk.
					useNotifications.setState((s) => ({
						notes: [
							{
								id: `n_${record.id}`,
								persona: "admin",
								source: "return",
								event: "return.new",
								actor: { kind: "person", name: record.customerName },
								title: record.kind === "claim" ? "meldt een probleem met" : "wil iets terugsturen uit",
								record: record.orderNumber,
								detail: `${record.number} · ${record.items.map((i) => `${i.qty}× ${i.title} (${i.variantTitle})`).join(", ")}`,
								to: `/returns/${record.id}`,
								at: createdAt,
								read: false,
								state: "inbox",
							},
							...s.notes,
						],
					}));
					return record;
				},
				approve: (ids, by, keepItem = false) =>
					patch(ids, (r) => ({
						...r,
						status: move(r.status, approvedStatus(r.kind, keepItem)),
						events: [...r.events, ev(keepItem && r.kind === "claim" ? "Goedgekeurd: nieuw artikel zonder terugsturen" : "Goedgekeurd", by)],
					})),
				reject: (ids, reason, by) =>
					patch(ids, (r) => ({ ...r, status: move(r.status, "rejected"), rejectReason: reason, events: [...r.events, ev(`Afgewezen: ${reason}`, by)] })),
				sendLabel: (ids, by, carrier) =>
					patch(ids, (r) => {
						if (r.status !== "awaiting_parcel" || r.label) return null;
						const s = get().settings.addresses;
						const c = carrier ?? s.find((a) => a.country === r.country)?.carrier ?? s.find((a) => a.country === (r.storeId === "store_us" ? "US" : "NL"))?.carrier ?? "PostNL";
						return { ...r, label: { carrier: c, tracking: tracking(c, Number(r.number.slice(2))), sentAt: now() }, events: [...r.events, ev(`Retourlabel van ${c} verstuurd`, by)] };
					}),
				advance: (id, to, event) => patch([id], (r) => ({ ...r, status: move(r.status, to), events: [...r.events, event] })),
				resolve: (id, kind, amount, by, replacementOrder) =>
					patch([id], (r) => ({
						...r,
						status: move(r.status, "resolved"),
						resolution: { kind, amount, at: now(), by, replacementOrder },
						events: [...r.events, ev(`Afgehandeld: ${RESOLUTION_LABEL[kind].toLowerCase()}${replacementOrder ? `, bestelling ${replacementOrder}` : ""}`, by)],
					})),
				assign: (ids, memberId, by) => patch(ids, (r) => ({ ...r, assignee: memberId, events: [...r.events, ev(memberId ? "Toegewezen" : "Toewijzing weggehaald", by)] })),
				note: (id, event) => patch([id], (r) => ({ ...r, events: [...r.events, event] })),
				saveSettings: (next) => {
					const before = get().settings;
					set({ settings: next });
					return () => set({ settings: before });
				},
			};
		},
		{
			name: "insyte:returns:v1",
			version: 1,
			partialize: (s) => ({ records: s.records, settings: s.settings, scenario: s.scenario }),
			merge: (persisted, current) => {
				const p = persisted as Partial<ReturnsState> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, records: p.records ?? current.records, settings: { ...current.settings, ...p.settings } };
			},
		},
	),
);

/* An agent's approval is taken back from the log: the return goes back to the status it had. */
effectHooks.returnStatus = (effect, direction) =>
	useReturns.setState((s) => ({
		records: s.records.map((r) => (r.id === effect.returnId ? { ...r, status: (direction === "forward" ? effect.to : effect.from) as ReturnStatus } : r)),
	}));

export { amountOf };
