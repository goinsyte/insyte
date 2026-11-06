import { create } from "zustand";
import { persist } from "zustand/middleware";
import { autonomySeed, SCENARIO, type Scenario } from "../../data-source";
import { useNotifications } from "./notifications-store";
import { useWorkspace } from "./workspace-store";
import {
	type AgentActionId,
	budgetState,
	type DecideContext,
	type Decision,
	decide as decidePure,
	DEFAULT_POLICY,
	diffPolicy,
	normalise,
	type PersonBudget,
	type Policy,
	type PolicyHistoryEntry,
} from "../lib/autonomy";

/*
 * The workspace's autonomy policy and AI budget (ADR-0027, PLAN 29), as the demo keeps them.
 *
 * Every agent touchpoint in the console asks `decide(action)` here, so switching a row on
 * Zelfstandigheid changes what the demo does: a plate becomes a log row and back. A spent
 * workspace budget makes every action a proposal until the month turns or the limit is raised.
 *
 * Persisted per browser, stamped with the design state it was seeded under, so a policy edited on
 * a normal Tuesday does not leak into the first day.
 */

type AutonomyState = {
	policy: Policy;
	version: number;
	history: PolicyHistoryEntry[];
	budget: { limit: number | null; used: number };
	people: PersonBudget[];
	background: number;
	scenario: Scenario;

	/** Keeps a new policy, versioned and in the history. Returns the way back. */
	savePolicy: (next: Policy, by: string) => () => void;
	setBudgetLimit: (limit: number | null) => void;
	setPersonLimit: (memberId: string, limit: number | null) => void;
};

const seed = () => ({
	policy: normalise(autonomySeed.policy),
	version: autonomySeed.version,
	history: [...autonomySeed.history],
	budget: { ...autonomySeed.budget },
	people: autonomySeed.people.map((p) => ({ ...p })),
	background: autonomySeed.background,
	scenario: SCENARIO,
});

export const useAutonomy = create<AutonomyState>()(
	persist(
		(set, get) => ({
			...seed(),
			savePolicy: (next, by) => {
				const before = get();
				const changes = diffPolicy(before.policy, next).map((c) => ({ id: c.id, from: c.from, to: c.to }));
				if (changes.length === 0) return () => {};
				const version = before.version + 1;
				const entry: PolicyHistoryEntry = { id: `pol_${version}_${Date.now().toString(36)}`, at: new Date().toISOString(), by, version, changes };
				set({ policy: normalise(next), version, history: [entry, ...before.history] });
				return () => set({ policy: before.policy, version: before.version, history: before.history });
			},
			setBudgetLimit: (limit) => set((s) => ({ budget: { ...s.budget, limit } })),
			setPersonLimit: (memberId, limit) => set((s) => ({ people: s.people.map((p) => (p.memberId === memberId ? { ...p, limit } : p)) })),
		}),
		{
			name: "insyte:autonomy:v1",
			version: 1,
			partialize: (s) => ({ policy: s.policy, version: s.version, history: s.history, budget: s.budget, people: s.people, scenario: s.scenario }),
			// A policy edited under another design state belongs to that state; a stored policy is
			// read through `normalise`, so an action added to the catalogue later arrives at its default.
			merge: (persisted, current) => {
				const p = persisted as Partial<AutonomyState> | undefined;
				if (!p || p.scenario !== SCENARIO) return current;
				return { ...current, ...p, policy: normalise(p.policy ?? {}) };
			},
		},
	),
);

/** Whether the workspace's AI budget is spent this month. */
export const workspaceSpent = (s: Pick<AutonomyState, "budget">) => budgetState(s.budget.used, s.budget.limit) === "spent";

/** The one question every touchpoint asks: may the agent do this now? */
export function decide(id: AgentActionId, ctx: DecideContext = {}): Decision {
	const s = useAutonomy.getState();
	return decidePure(s.policy, id, { budgetSpent: workspaceSpent(s), ...ctx });
}

/** `decide` as a hook, re-rendering when the policy or the budget changes. */
export function useDecide(id: AgentActionId, ctx: DecideContext = {}): Decision {
	const policy = useAutonomy((s) => s.policy);
	const spent = useAutonomy(workspaceSpent);
	return decidePure(policy, id, { budgetSpent: spent, ...ctx });
}

export { DEFAULT_POLICY };

/* At 80% the person and the owner hear about it (ADR-0027): once per person per month, as a notification. */
function warnBudgets() {
	const s = useAutonomy.getState();
	const members = useWorkspace.getState().members;
	const month = new Date().toISOString().slice(0, 7);
	const notes = useNotifications.getState().notes;
	const warn = [
		...(budgetState(s.budget.used, s.budget.limit) !== "ok" ? [{ id: "workspace", who: "De werkruimte", used: s.budget.used, limit: s.budget.limit }] : []),
		...s.people
			.filter((p) => budgetState(p.used, p.limit) !== "ok")
			.map((p) => ({ id: p.memberId, who: members.find((m) => m.id === p.memberId)?.name ?? "Iemand", used: p.used, limit: p.limit })),
	];
	const fresh = warn.filter((w) => !notes.some((n) => n.id === `n_budget_${w.id}_${month}`));
	if (fresh.length === 0) return;
	useNotifications.setState((st) => ({
		notes: [
			...fresh.map((w) => ({
				id: `n_budget_${w.id}_${month}`,
				persona: "admin" as const,
				source: "insyte" as const,
				event: "insyte.budget" as const,
				actor: { kind: "insyte" as const },
				title: `ziet dat ${w.who} ${Math.round((w.used / (w.limit ?? 1)) * 100)}% van het AI-budget heeft gebruikt:`,
				record: `€${Math.round(w.used)} van €${w.limit}`,
				detail: w.used >= (w.limit ?? Infinity) ? "Insyte handelt niet meer zelf tot de maand omslaat of de limiet omhoog gaat." : "Bij 100% komt alles als voorstel. Je kunt de limiet verhogen onder Limieten.",
				tone: "amber" as const,
				to: "/settings/ai/limits",
				at: new Date(Date.now() - 42 * 60_000).toISOString(),
				read: false,
				state: "inbox" as const,
			})),
			...st.notes,
		],
	}));
}
warnBudgets();
