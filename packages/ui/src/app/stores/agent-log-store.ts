import { create } from "zustand";
import { persist } from "zustand/middleware";
import { agentActionsSeed, SCENARIO, type Scenario } from "../../data-source";
import type { AgentEffect, AgentLogEntry, AgentLogStatus } from "../lib/agent-log";
import { UNDO_WINDOW_MS } from "../lib/autonomy";
import { useInbox } from "./inbox-store";
import { useNotifications } from "./notifications-store";
import { useWorkspace } from "./workspace-store";

/*
 * The agent's activity log (PLAN 30, ADR-0027).
 *
 * The seeded rows are rebuilt from the fixtures on every load, measured back from now, so the
 * newest are always inside their window. What persists is what happened to them here — undone, by
 * whom — and the rows this session added, so an undo survives a reload the way ADR-0023 says it
 * must. Every effect is idempotent and is laid onto the workspace once at load: a row that is done
 * is true of the record, a row that was undone is not.
 *
 * The agent does not toast. Its work shows on the log, on the record's timeline and on Start's
 * card; a notification is raised only when an action failed.
 */

type Override = { status: AgentLogStatus; undoneBy?: string; at?: number };

/** What became of a touchpoint the agent raised: it ran (or was filed) as a log row, or was set aside. */
export type SuggestionState = { state: "ran" | "filed"; entryId: string } | { state: "discarded" };

type LogState = {
	overrides: Record<string, Override>;
	added: AgentLogEntry[];
	/** By touchpoint key ("forward:sup_allure"), so a plate filed or a row run stays that way. */
	suggestions: Record<string, SuggestionState>;
	scenario: Scenario;
	settle: (key: string, state: SuggestionState | null) => void;
	/** Adds a row for an action the agent just took. Its effect must already be applied. */
	record: (entry: Omit<AgentLogEntry, "id" | "at" | "undoUntil" | "policyVersion" | "model" | "promptVersion"> & Partial<AgentLogEntry>) => AgentLogEntry;
	/** Takes an action back inside its window. Returns false when the window has closed. */
	undo: (id: string, by: string) => boolean;
	/** Puts an undone row back, for the undo of the undo. */
	redo: (id: string) => void;
};

const MODEL = "claude-sonnet · insyte-agent";

/* ── applying an effect to the records ─────────────────────────────────────────────────────── */

const patchTicket = (id: string, patch: (t: ReturnType<typeof useWorkspace.getState>["tickets"][number]) => ReturnType<typeof useWorkspace.getState>["tickets"][number]) =>
	useWorkspace.setState((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? patch(t) : t)) }));

export function applyEffect(effect: AgentEffect, direction: "forward" | "back") {
	const fwd = direction === "forward";
	switch (effect.kind) {
		case "ticket.assign":
			patchTicket(effect.ticketId, (t) => ({ ...t, assignee_ids: [...(fwd ? effect.to : effect.from)] }));
			return;
		case "ticket.status":
			patchTicket(effect.ticketId, (t) => ({ ...t, status: (fwd ? effect.to : effect.from) as typeof t.status }));
			return;
		case "ticket.priority":
			patchTicket(effect.ticketId, (t) => ({ ...t, priority: (fwd ? effect.to : effect.from) as typeof t.priority }));
			return;
		case "ticket.label":
			patchTicket(effect.ticketId, (t) => ({ ...t, tags: fwd ? [...new Set([...t.tags, effect.label])] : t.tags.filter((x) => x !== effect.label) }));
			return;
		case "ticket.snooze":
			patchTicket(effect.ticketId, (t) => ({ ...t, snoozed_until: fwd ? effect.until : undefined }));
			return;
		case "order.label":
			useWorkspace.setState((s) => ({
				orders: s.orders.map((o) => (o.id === effect.orderId ? { ...o, tags: fwd ? [...new Set([...o.tags, effect.label])] : o.tags.filter((x) => x !== effect.label) } : o)),
			}));
			return;
		case "thread.label": {
			const t = useInbox.getState().threads.find((x) => x.id === effect.threadId);
			if (t) useInbox.getState().update(t.id, { labels: fwd ? [...new Set([...t.labels, effect.label])] : t.labels.filter((x) => x !== effect.label) });
			return;
		}
		case "thread.assign":
			useInbox.getState().update(effect.threadId, { assignee: (fwd ? effect.to : effect.from) ?? undefined });
			return;
		case "order.forward":
			// The forwarding queue lays this one down itself (`stores/forwarding-store.ts`).
			effectHooks.forward?.(effect, direction);
			return;
		case "return.status":
			effectHooks.returnStatus?.(effect, direction);
			return;
		case "send":
		case "note":
			// A send that is undone never left (it waited out the window); a note is simply gone.
			return;
	}
}

/** Effects other stores own register here, so this store does not import them back. */
export const effectHooks: {
	forward?: (effect: Extract<AgentEffect, { kind: "order.forward" }>, direction: "forward" | "back") => void;
	returnStatus?: (effect: Extract<AgentEffect, { kind: "return.status" }>, direction: "forward" | "back") => void;
} = {};

/* ── the store ─────────────────────────────────────────────────────────────────────────────── */

export const useAgentLog = create<LogState>()(
	persist(
		(set) => ({
			overrides: {},
			added: [],
			suggestions: {},
			scenario: SCENARIO,
			settle: (key, state) =>
				set((s) => {
					const { [key]: _old, ...rest } = s.suggestions;
					return { suggestions: state ? { ...rest, [key]: state } : rest };
				}),
			record: (draft) => {
				const at = Date.now();
				const entry: AgentLogEntry = {
					policyVersion: 1,
					model: MODEL,
					promptVersion: "agent-v14",
					...draft,
					id: `act_${at.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
					at: new Date(at).toISOString(),
					undoUntil: draft.effect ? at + UNDO_WINDOW_MS : undefined,
				};
				set((s) => ({ added: [entry, ...s.added] }));
				if (entry.status === "failed") notifyFailed(entry);
				return entry;
			},
			undo: (id, by) => {
				const e = entryById(id);
				if (!e?.effect || e.undoUntil === undefined || e.undoUntil <= Date.now()) return false;
				if (e.status !== "done" && e.status !== "sending") return false;
				applyEffect(e.effect, "back");
				set((s) => ({ overrides: { ...s.overrides, [id]: { status: "undone", undoneBy: by, at: Date.now() } } }));
				return true;
			},
			redo: (id) => {
				const e = entryById(id);
				if (e?.effect) applyEffect(e.effect, "forward");
				set((s) => {
					const { [id]: _gone, ...rest } = s.overrides;
					return { overrides: rest };
				});
			},
		}),
		{
			name: "insyte:agent-log:v1",
			version: 1,
			partialize: (s) => ({ overrides: s.overrides, added: s.added.slice(0, 200), suggestions: s.suggestions, scenario: s.scenario }),
			merge: (persisted, current) => {
				const p = persisted as Partial<LogState> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, overrides: p.overrides ?? {}, added: p.added ?? [], suggestions: p.suggestions ?? {} };
			},
		},
	),
);

/** The seeded rows and this session's, with what happened to them here, newest first. */
export function allEntries(s: Pick<LogState, "overrides" | "added">): AgentLogEntry[] {
	const seeded = agentActionsSeed.map((e) => {
		const o = s.overrides[e.id];
		return o ? { ...e, status: o.status, undoneBy: o.undoneBy ?? e.undoneBy } : e;
	});
	const added = s.added.map((e) => {
		const o = s.overrides[e.id];
		return o ? { ...e, status: o.status, undoneBy: o.undoneBy ?? e.undoneBy } : e;
	});
	return [...added, ...seeded].sort((a, b) => b.at.localeCompare(a.at));
}

function entryById(id: string) {
	return allEntries(useAgentLog.getState()).find((e) => e.id === id);
}

/** Every row, live. Memoised on the two pieces of state it reads. */
let cache: { o: LogState["overrides"]; a: LogState["added"]; rows: AgentLogEntry[] } | null = null;
export function useAgentEntries(): AgentLogEntry[] {
	const overrides = useAgentLog((s) => s.overrides);
	const added = useAgentLog((s) => s.added);
	if (!cache || cache.o !== overrides || cache.a !== added) cache = { o: overrides, a: added, rows: allEntries({ overrides, added }) };
	return cache.rows;
}

/** A failed action is the one thing the agent raises as a notification. */
function notifyFailed(e: AgentLogEntry) {
	useNotifications.setState((s) => ({
		notes: [
			{
				id: `n_${e.id}`,
				persona: "admin",
				source: "insyte",
				event: "insyte.action",
				actor: { kind: "insyte" },
				title: "kon een actie niet uitvoeren:",
				record: e.record?.label ?? "",
				detail: e.failReason ?? e.sentence,
				tone: "red",
				to: "/ask/activity",
				search: { row: e.id },
				at: e.at,
				read: false,
				state: "inbox",
			},
			...s.notes,
		],
	}));
}

/* Laid onto the workspace once, at load: done rows are true of their records, undone rows are not. */
for (const e of allEntries(useAgentLog.getState())) {
	if (!e.effect) continue;
	if (e.status === "done" || e.status === "sending") applyEffect(e.effect, "forward");
	else if (e.status === "undone") applyEffect(e.effect, "back");
}
