import { useSyncExternalStore } from "react";
import { automations } from "../../data-source";
import { SCENARIO } from "../../data-source";
import {
	flatNodes,
	newNodeId,
	VARIANTS_BY_ID,
	type VersionEntry,
	type WorkflowNode,
	type WorkflowRun,
	type WorkflowSettings,
	type WorkflowState,
} from "./node-types";
import { makeRun, sampleFor, seedRuns } from "./runs";
import { missingScope } from "./scopes";
import { titleOf } from "./summary";

export const ME = "Elena Hart";

function triggerByText(text: string) {
	const t = text.toLowerCase();
	if (t.includes("verzonden")) return "trigger.order_shipped";
	if (t.includes("shipping") || t.includes("delay") || t.includes("verzend") || t.includes("vertraag") || t.includes("te laat"))
		return "trigger.shipping_delay";
	if (t.includes("refund") || t.includes("terugbetal") || t.includes("retour")) return "trigger.refund_requested";
	if (t.includes("review")) return "trigger.review_received";
	if (t.includes("chargeback") || t.includes("geschil")) return "trigger.chargeback";
	if (t.includes("inventory") || t.includes("voorraad")) return "trigger.inventory_low";
	if (t.includes("inactief") || t.includes("dagen") || t.includes("elke")) return "trigger.schedule";
	if (t.includes("feedback") || t.includes("reply") || t.includes("antwoord") || t.includes("reactie")) return "trigger.customer_reply";
	if (t.includes("keyword") || t.includes("email") || t.includes("trefwoord") || t.includes("e-mail") || t.includes("mail"))
		return "trigger.email_received";
	if (t.includes("account") || t.includes("wachtwoord")) return "trigger.webhook";
	return "trigger.order_placed";
}

function actionByText(text: string) {
	const t = text.toLowerCase();
	if (t.includes("slack")) return "action.slack_notify";
	if (t.includes("klaviyo")) return "action.klaviyo_send";
	if (t.includes("excus") || t.includes("persoonlijk") || t.includes("apology")) return "action.ai_compose";
	if (t.includes("bon") || t.includes("factuur")) return "action.exact_invoice";
	if (t.includes("mail") || t.includes("sms") || t.includes("push") || t.includes("enquête")) return "action.send_email";
	if ((t.includes("melden") || t.includes("laat weten")) && (t.includes("supplier") || t.includes("leverancier"))) return "action.notify_supplier";
	if (t.includes("kanaal") || t.includes("sales") || t.includes("cx-")) return "action.slack_notify";
	if (t.includes("notify") || t.includes("alert") || t.includes("melden") || t.includes("waarschuw") || t.includes("laat weten")) return "action.alert_team";
	if (t.includes("ticket") || t.includes("zaak") || t.includes("lead")) return "action.create_ticket";
	if (t.includes("tag") || t.includes("label")) return "action.tag_customer";
	if (t.includes("refund") || t.includes("terugbetal")) return "action.stripe_refund";
	if (t.includes("bewijs") || t.includes("verzendbevestiging") || t.includes("koppel")) return "action.ai_link_orders";
	if (t.includes("toewijzen")) return "action.assign_supplier";
	if (t.includes("inkooporder") || t.includes("supplier") || t.includes("leverancier") || t.includes("po")) return "action.notify_supplier";
	if (t.includes("herinnering") || t.includes("inplannen")) return "delay.wait";
	if (t.includes("tonen") || t.includes("melding")) return "action.track_event";
	return "action.create_ticket";
}

const node = (variantId: string, config: Record<string, unknown> = {}, branches?: WorkflowNode["branches"]): WorkflowNode => ({
	id: newNodeId(),
	variantId,
	config: { ...(VARIANTS_BY_ID[variantId]?.defaultConfig ?? {}), ...config },
	...(branches ? { branches } : {}),
});

/** A flow from its steps, in order: what something outside the builder prepares (the first analysis). */
export const nodesFrom = (steps: ReadonlyArray<readonly [string, Record<string, unknown>?]>) => steps.map(([id, config]) => node(id, config));

const DEFAULT_SETTINGS: WorkflowSettings = { scopesOff: [], scopesExtra: [], notify: ME, rateLimit: 0 };

const cloneNodes = (nodes: ReadonlyArray<WorkflowNode>): WorkflowNode[] =>
	nodes.map((n) => ({
		...n,
		id: newNodeId(),
		config: { ...n.config },
		...(n.branches ? { branches: { yes: cloneNodes(n.branches.yes), no: cloneNodes(n.branches.no) } } : {}),
	}));

/* The canonical flow, the one the builder opens on: a late order, an apology drafted in the brand's
   voice, and a splitsing on the order's value: a big order gets a discount and a person, a small one
   the new date. Both lanes merge back to wait for the customer and then ask the supplier. */
function richNodes(): WorkflowNode[] {
	return [
		node("trigger.shipping_delay", { summary: "Shopify · levering 2 dagen na de verwachte datum" }),
		node("action.ai_compose", { instructions: "Excuses in de stem van het merk, met de nieuwe leverdatum" }),
		node("condition.branch", { expression: "{{order.total}} > 100" }, {
			yes: [
				node("action.klaviyo_send", { template: "Excuses + 10% korting" }),
				node("action.create_ticket", { title: "Opvolgen: {{order.number}}", assignee: "Maya Roy", priority: "high" }),
			],
			no: [node("action.send_email", { subject: "Excuses + nieuwe leverdatum" })],
		}),
		node("delay.wait_no_reply", { hours: 24 }),
		node("action.notify_supplier", { supplier: "Yiwu Trading", message: "Bestelling {{order.number}} is te laat. Kun je de verzending bevestigen?" }),
	];
}

const NOTES = ["Eerste publicatie", "Wachttijd naar 24 u", "Stap toegevoegd", "Tekst van de mail aangescherpt", "Ja/nee-splitsing op bestelwaarde"];
const BY = [ME, "Maya Roy", ME, "Liam Tucker", ME];

/** v1…vN for a seeded flow: each older version had one step fewer. */
function seedVersions(nodes: WorkflowNode[], count: number, last: string, first: string): VersionEntry[] {
	const end = Date.parse(last);
	const start = Date.parse(first);
	return Array.from({ length: count }, (_, i) => {
		const v = i + 1;
		const kept = Math.max(2, nodes.length - (count - v));
		return {
			v,
			at: new Date(start + ((end - start) * i) / Math.max(1, count)).toISOString(),
			by: BY[i % BY.length],
			note: v === count && count > 2 ? NOTES[4] : NOTES[Math.min(i, 3)],
			nodes: v === count ? nodes : cloneNodes(nodes.slice(0, kept)),
		};
	}).reverse();
}

/* Which of a flow's recent runs did not simply go through, by position from the newest. */
const PATTERNS: Record<string, { failed?: number; waiting?: number; duplicate?: number }> = {
	auto_1: { waiting: 0, failed: 3, duplicate: 5 },
	auto_2: { failed: 1 },
	auto_5: { failed: 0 },
	auto_8: { failed: 2, duplicate: 4 },
	auto_10: { failed: 1 },
};

const DESCRIPTIONS: Record<string, string> = {
	auto_1:
		"Als een bestelling te laat is, stelt Insyte excuses op. Boven €100 krijgt de klant 10% korting en Maya een ticket, anders de nieuwe leverdatum; daarna vraagt de flow de leverancier de verzending te bevestigen.",
};

function buildSeed(): Record<string, WorkflowState> {
	const seed: Record<string, WorkflowState> = {};
	const busy = SCENARIO === "busy";
	for (const a of automations) {
		const nodes =
			a.id === "auto_1"
				? richNodes()
				: [
						node(triggerByText(a.trigger), { summary: a.trigger }),
						...a.actions.map((act) => node(actionByText(act), { title_override: act })),
					];
		const ran = (a.total_runs ?? 0) > 0 && a.last_run_at !== undefined;
		const published = a.status !== "draft" || ran;
		const version = !published ? 0 : a.id === "auto_1" ? 4 : 1 + ((a.total_runs ?? 0) % 3);
		const history = ran
			? seedRuns(a.id, nodes, {
					last: a.last_run_at ?? a.created_at,
					perMonth: Math.max(4, a.runs_30d),
					count: Math.min(busy ? 24 : 10, a.total_runs ?? 10),
					version,
					pattern: PATTERNS[a.id] ?? (busy && Number(a.id.split("_")[1]) % 3 === 0 ? { failed: 2, waiting: 4 } : {}),
				})
			: [];
		seed[a.id] = {
			automationId: a.id,
			name: a.name,
			description: DESCRIPTIONS[a.id] ?? a.description,
			status: a.status,
			nodes,
			savedAt: a.last_run_at ?? a.created_at,
			createdAt: a.created_at,
			owner: a.id === "auto_9" || a.id === "auto_12" ? "Maya Roy" : ME,
			version,
			versions: version ? seedVersions(nodes, version, a.last_run_at ?? a.created_at, a.created_at) : [],
			settings: { ...DEFAULT_SETTINGS, notify: a.id === "auto_8" ? "Liam Tucker" : ME, rateLimit: a.id === "auto_4" ? 120 : 0 },
			runs: a.total_runs ?? a.runs_30d,
			history,
		};
	}
	return seed;
}

/* A plain-language prompt read as a flow: what starts it, an optional country check, then two or three
   actions, one per clause. Scripted, so the same sentence always lays out the same steps. */
const COUNTRIES: ReadonlyArray<[RegExp, string]> = [
	[/\bgerman(y)?\b|\bduits(land|e)?\b/i, "Duitsland"],
	[/\bfrance|french\b|\bfrankrijk\b|\bfranse?\b/i, "Frankrijk"],
	[/\b(nederland|netherlands|dutch)\b/i, "Nederland"],
	[/\b(belgi(ë|e)|belgische?)\b/i, "België"],
	[/\b(uk|british|united kingdom|vk|verenigd koninkrijk|engeland|britse?)\b/i, "Verenigd Koninkrijk"],
];

export function draftFromPrompt(prompt: string): WorkflowNode[] {
	const text = prompt.trim();
	const lower = text.toLowerCase();
	const triggerId = /\b(late|delay|delayed|overdue|vertraagd|vertraging|achterstallig)\b|te laat/.test(lower) ? "trigger.shipping_delay" : triggerByText(text);
	const [head, ...rest] = text.split(/,|\bthen\b|\bdan\b/i);
	const nodes: WorkflowNode[] = [node(triggerId, { summary: head.replace(/^\s*(when|if|once|als|wanneer|zodra)\s+/i, "").trim() })];

	const country = COUNTRIES.find(([re]) => re.test(text))?.[1];
	if (country) nodes.push(node("condition.country", { country }));

	const clauses = rest
		.join(",")
		.split(/,|\band\b|\ben\b/i)
		.map((c) => c.trim().replace(/\.$/, ""))
		.filter(Boolean);
	const seen = new Set<string>();
	for (const clause of clauses) {
		const id = actionByText(clause);
		if (seen.has(id)) continue;
		seen.add(id);
		const who = /\bvoor\s+([A-Z][a-z]+)/.exec(clause)?.[1];
		nodes.push(node(id, who && id === "action.create_ticket" ? { assignee: who } : {}));
		if (seen.size === 3) break;
	}
	// "Boven €100" or "meer dan 100" splits the flow on the order's value.
	const over = /(boven|meer dan|over)\s*€?\s*(\d+)/i.exec(text)?.[2];
	if (over && nodes.length > 2) {
		const [first, ...tail] = nodes.slice(1);
		return [nodes[0], node("condition.branch", { expression: `{{order.total}} > ${over}` }, { yes: [first, ...tail], no: [] })];
	}
	for (const fallback of ["action.create_ticket", "action.alert_team"]) {
		if (seen.size >= 2) break;
		if (seen.has(fallback)) continue;
		seen.add(fallback);
		nodes.push(node(fallback));
	}
	return nodes;
}

export const UNTITLED = "Naamloze automatisering";

/** A name read off the steps: "Bestelling vertraagd → E-mail versturen + Ticket aanmaken". */
export function nameFromNodes(nodes: WorkflowNode[]) {
	const [trigger, ...rest] = nodes;
	if (!trigger) return UNTITLED;
	const actions = flatNodes(rest)
		.map((n) => VARIANTS_BY_ID[n.variantId])
		.filter((v) => v?.kind === "action")
		.slice(0, 2)
		.map((v) => v.label);
	const head = VARIANTS_BY_ID[trigger.variantId]?.label ?? "Flow";
	return actions.length ? `${head} → ${actions.join(" + ")}` : head;
}

/* What was published survives a reload, in this browser, and so does the work on the canvas that is
   not published yet: it is kept apart (`working`) so the builder still says "not published" after a
   reload, and Wijzigingen terugdraaien still goes back to the live version. Deleted seeded flows stay
   deleted. v3 added versions, settings, the splitsing's lanes and the working copy; a v2 store's own
   drafts come across with those filled in, and the seeded flows are rebuilt. */
const STORAGE_KEY = "insyte.workflows.v3";
const OLD_KEYS = ["insyte.workflows.v2", "insyte.workflows.v1"];

type Stored = { saved: Record<string, WorkflowState>; working?: Record<string, WorkflowState>; removed: string[] };

function normalize(w: Partial<WorkflowState> & { automationId: string }): WorkflowState {
	return {
		name: UNTITLED,
		description: "",
		status: "draft",
		nodes: [],
		savedAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
		runs: 0,
		history: [],
		...w,
		owner: w.owner ?? ME,
		version: w.version ?? 0,
		versions: w.versions ?? [],
		settings: { ...DEFAULT_SETTINGS, ...(w.settings ?? {}) },
	};
}

function load(): Stored | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			const key = OLD_KEYS.find((k) => localStorage.getItem(k));
			if (!key) return null;
			const v = JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<Stored>;
			const drafts = Object.fromEntries(
				Object.entries(v.saved ?? {})
					.filter(([id]) => id.startsWith("auto_draft_"))
					.map(([id, w]) => [id, normalize({ ...w, automationId: id })]),
			);
			for (const k of OLD_KEYS) localStorage.removeItem(k);
			return { saved: drafts, removed: Array.isArray(v.removed) ? v.removed : [] };
		}
		const v = JSON.parse(raw) as Partial<Stored>;
		const fix = (m: Record<string, WorkflowState> | undefined) =>
			Object.fromEntries(Object.entries(m ?? {}).map(([id, w]) => [id, normalize({ ...w, automationId: id })]));
		return { saved: fix(v.saved), working: fix(v.working), removed: Array.isArray(v.removed) ? v.removed : [] };
	} catch {
		return null;
	}
}

function initial(): { saved: Record<string, WorkflowState>; working: Record<string, WorkflowState> } {
	const seed = buildSeed();
	const stored = load();
	if (!stored) return { saved: seed, working: {} };
	const merged = { ...seed, ...stored.saved };
	for (const id of stored.removed) delete merged[id];
	const working = Object.fromEntries(Object.entries(stored.working ?? {}).filter(([id]) => merged[id] !== undefined));
	return { saved: merged, working };
}

const SEED_IDS = new Set(automations.map((a) => a.id));

const boot = initial();
/* The workflow as it stood at its last publication, by reference: an edit replaces the object, so
   "unpublished" is simply "not the same object". */
let saved: Record<string, WorkflowState> = boot.saved;
let state: Record<string, WorkflowState> = { ...boot.saved, ...boot.working };
let draftSeq = 0;
const listeners = new Set<() => void>();

function persist() {
	try {
		const kept = Object.fromEntries(Object.entries(saved).filter(([id]) => state[id] !== undefined));
		const working = Object.fromEntries(Object.entries(state).filter(([id, w]) => saved[id] !== w));
		const removed = [...SEED_IDS].filter((id) => state[id] === undefined);
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ saved: kept, working, removed } satisfies Stored));
	} catch {
		// A private window keeps nothing past the tab; the builder works the same.
	}
}

function notify() {
	persist();
	for (const l of listeners) l();
}

/* ── where a step goes: the main line, or one lane of a splitsing ────────────────────────────────── */

export type Lane = { branchId: string; side: "yes" | "no" };
export type Place = { lane?: Lane; index: number };

const isTrigger = (n?: WorkflowNode) => (n ? VARIANTS_BY_ID[n.variantId]?.kind === "trigger" : false);

function withList(nodes: WorkflowNode[], lane: Lane | undefined, f: (list: WorkflowNode[]) => WorkflowNode[]): WorkflowNode[] {
	if (!lane) return f(nodes);
	return nodes.map((n) => (n.id === lane.branchId && n.branches ? { ...n, branches: { ...n.branches, [lane.side]: f(n.branches[lane.side]) } } : n));
}

function without(nodes: WorkflowNode[], nodeId: string): [WorkflowNode[], WorkflowNode | null] {
	let found: WorkflowNode | null = null;
	const out = nodes
		.filter((n) => {
			if (n.id === nodeId) {
				found = n;
				return false;
			}
			return true;
		})
		.map((n) => {
			if (!n.branches || found) return n;
			const [yes, a] = without(n.branches.yes, nodeId);
			const [no, b] = without(n.branches.no, nodeId);
			found = a ?? b;
			return found ? { ...n, branches: { yes, no } } : n;
		});
	return [out, found];
}

/** Where a node sits now. */
export function placeOf(nodes: ReadonlyArray<WorkflowNode>, nodeId: string): Place | null {
	const i = nodes.findIndex((n) => n.id === nodeId);
	if (i >= 0) return { index: i };
	for (const n of nodes) {
		if (!n.branches) continue;
		for (const side of ["yes", "no"] as const) {
			const j = n.branches[side].findIndex((m) => m.id === nodeId);
			if (j >= 0) return { lane: { branchId: n.id, side }, index: j };
		}
	}
	return null;
}

function insertInto(nodes: WorkflowNode[], n: WorkflowNode, place: Place): WorkflowNode[] {
	return withList(nodes, place.lane, (list) => {
		const min = !place.lane && isTrigger(list[0]) ? 1 : 0;
		const at = Math.max(min, Math.min(place.index, list.length));
		const next = [...list];
		next.splice(at, 0, n);
		return next;
	});
}

function set(id: string, patch: (w: WorkflowState) => WorkflowState) {
	const w = state[id];
	if (!w) return;
	state = { ...state, [id]: patch(w) };
	notify();
}

/** A change that is not an edit to the flow (a run, a setting, on or off) lands on the published copy too. */
function setBoth(id: string, patch: (w: WorkflowState) => WorkflowState) {
	const w = state[id];
	if (!w) return;
	const dirty = state[id] !== saved[id];
	const next = patch(w);
	state = { ...state, [id]: next };
	const snap = saved[id];
	saved = { ...saved, [id]: dirty && snap ? patch(snap) : next };
	notify();
}

export const workflowStore = {
	get: () => state,
	/** The flow as it was last published (or saved, for a draft). */
	published: (id: string): WorkflowState | undefined => saved[id],
	isDirty(id: string) {
		return state[id] !== undefined && state[id] !== saved[id];
	},
	/** Keeps the flow as it stands without publishing a version: a draft made from a template. */
	save(id: string) {
		const w = state[id];
		if (!w) return;
		const next = { ...w, savedAt: new Date().toISOString() };
		state = { ...state, [id]: next };
		saved = { ...saved, [id]: next };
		notify();
	},
	/** Publishes what is on the canvas as the next version. A draft's first publication turns it on. */
	publish(id: string, note: string) {
		const w = state[id];
		if (!w) return null;
		const before = saved[id];
		const v = w.version + 1;
		const at = new Date().toISOString();
		const next: WorkflowState = {
			...w,
			version: v,
			status: w.status === "draft" ? "active" : w.status,
			savedAt: at,
			versions: [{ v, at, by: ME, note, nodes: cloneNodes(w.nodes) }, ...w.versions],
		};
		state = { ...state, [id]: next };
		saved = { ...saved, [id]: next };
		notify();
		return () => {
			if (!before) return;
			state = { ...state, [id]: { ...w } };
			saved = { ...saved, [id]: before };
			notify();
		};
	},
	revert(id: string) {
		const snap = saved[id];
		if (!snap) return;
		state = { ...state, [id]: snap };
		notify();
	},
	/** Puts an older version on the canvas as an unpublished change. */
	restoreVersion(id: string, v: number) {
		const w = state[id];
		const entry = w?.versions.find((x) => x.v === v);
		if (!w || !entry) return null;
		const prev = w.nodes;
		set(id, (x) => ({ ...x, nodes: cloneNodes(entry.nodes) }));
		return () => set(id, (x) => ({ ...x, nodes: prev }));
	},
	create(patch: Partial<Pick<WorkflowState, "name" | "nodes">> = {}) {
		draftSeq += 1;
		const id = `auto_draft_${Date.now().toString(36)}_${draftSeq}`;
		const now = new Date().toISOString();
		const w = normalize({ automationId: id, name: patch.name ?? UNTITLED, nodes: patch.nodes ?? [], savedAt: now, createdAt: now });
		state = { ...state, [id]: w };
		saved = { ...saved, [id]: w };
		notify();
		return id;
	},
	duplicate(id: string) {
		const w = state[id];
		if (!w) return null;
		const copy = workflowStore.create({ name: `${w.name} (kopie)`, nodes: cloneNodes(w.nodes) });
		workflowStore.updateMeta(copy, { description: w.description });
		workflowStore.save(copy);
		return copy;
	},
	remove(id: string) {
		const w = state[id];
		if (!w) return null;
		const snap = saved[id];
		const { [id]: _gone, ...rest } = state;
		state = rest;
		notify();
		return () => {
			state = { ...state, [id]: w };
			if (snap) saved = { ...saved, [id]: snap };
			notify();
		};
	},
	replaceNodes(id: string, nodes: WorkflowNode[], name?: string) {
		set(id, (w) => ({ ...w, nodes, name: name ?? w.name }));
	},
	recordRun(id: string, run: WorkflowRun) {
		setBoth(id, (x) => ({ ...x, runs: x.runs + 1, history: [run, ...x.history] }));
	},
	subscribe(l: () => void) {
		listeners.add(l);
		return () => listeners.delete(l);
	},
	getWorkflow(id: string): WorkflowState | undefined {
		return state[id];
	},
	updateMeta(id: string, patch: Partial<Pick<WorkflowState, "name" | "description" | "status">>) {
		set(id, (w) => ({ ...w, ...patch }));
	},
	setStatus(id: string, status: WorkflowState["status"]) {
		setBoth(id, (w) => ({ ...w, status }));
	},
	updateSettings(id: string, patch: Partial<WorkflowSettings>) {
		setBoth(id, (w) => ({ ...w, settings: { ...w.settings, ...patch } }));
	},
	/** Adds a step at a place; a trigger always replaces the one at the head. */
	insertAt(id: string, variantId: string, place: Place): WorkflowNode | null {
		const w = state[id];
		const variant = VARIANTS_BY_ID[variantId];
		if (!w || !variant) return null;
		if (variant.kind === "trigger") {
			const n = node(variantId);
			set(id, (x) => ({ ...x, nodes: isTrigger(x.nodes[0]) ? [n, ...x.nodes.slice(1)] : [n, ...x.nodes] }));
			return n;
		}
		if (variant.kind === "branch" && place.lane) return null;
		const n = node(variantId, {}, variant.kind === "branch" ? { yes: [], no: [] } : undefined);
		set(id, (x) => ({ ...x, nodes: insertInto(x.nodes, n, place) }));
		return n;
	},
	/** Moves a step to another place, in its own lane or another. */
	moveTo(id: string, nodeId: string, place: Place) {
		const w = state[id];
		if (!w) return;
		const from = placeOf(w.nodes, nodeId);
		const [rest, moving] = without(w.nodes, nodeId);
		if (!moving || !from || isTrigger(moving)) return;
		if (moving.branches && place.lane) return;
		const sameList = (from.lane?.branchId ?? "") === (place.lane?.branchId ?? "") && from.lane?.side === place.lane?.side;
		const index = sameList && from.index < place.index ? place.index - 1 : place.index;
		set(id, (x) => ({ ...x, nodes: insertInto(rest, moving, { ...place, index }) }));
	},
	removeNode(id: string, nodeId: string) {
		const w = state[id];
		if (!w) return null;
		const at = placeOf(w.nodes, nodeId);
		const [nodes, gone] = without(w.nodes, nodeId);
		if (!gone || !at || isTrigger(gone)) return null;
		set(id, (x) => ({ ...x, nodes }));
		return () => set(id, (x) => ({ ...x, nodes: insertInto(x.nodes, gone, at) }));
	},
	updateNodeConfig(id: string, nodeId: string, patch: Record<string, unknown>) {
		const apply = (list: WorkflowNode[]): WorkflowNode[] =>
			list.map((n) =>
				n.id === nodeId
					? { ...n, config: { ...n.config, ...patch } }
					: n.branches
						? { ...n, branches: { yes: apply(n.branches.yes), no: apply(n.branches.no) } }
						: n,
			);
		set(id, (w) => ({ ...w, nodes: apply(w.nodes) }));
	},
};

export function useWorkflow(id: string): WorkflowState | undefined {
	const all = useSyncExternalStore(workflowStore.subscribe, workflowStore.get, workflowStore.get);
	return all[id];
}

export function useWorkflows(): Record<string, WorkflowState> {
	return useSyncExternalStore(workflowStore.subscribe, workflowStore.get, workflowStore.get);
}

/* ── the test run ────────────────────────────────────────────────────────────────────────────────── */

/* The step a test is on, shared by the header that starts it and the canvas that lights it; and the
   step a failed test stopped at, which the canvas keeps red until the flow is edited. */
type ActiveRun = { automationId: string; nodeId: string | null; failedId?: string };
let activeRun: ActiveRun | null = null;
const runListeners = new Set<() => void>();

export const runStore = {
	get: () => activeRun,
	set(next: ActiveRun | null) {
		activeRun = next;
		for (const l of runListeners) l();
	},
	subscribe(l: () => void) {
		runListeners.add(l);
		return () => runListeners.delete(l);
	},
};

export function useActiveRun() {
	return useSyncExternalStore(runStore.subscribe, runStore.get, runStore.get);
}

const STEP_MS = 320;

export type TestResult =
	| { ok: true; sample: { number: string; name: string }; steps: number }
	| { ok: false; sample: { number: string; name: string }; nodeId: string; step: string; reason: string };

/** What stops a step in a test: a field it cannot do without, or a right the flow does not hold. */
function blocker(n: WorkflowNode, settings: WorkflowSettings): string | null {
	const v = VARIANTS_BY_ID[n.variantId];
	if (!v) return null;
	const empty = v.fields.find((f) => "required" in f && f.required && String(n.config[f.key] ?? "").trim() === "");
	if (empty) return `${empty.label} is leeg.`;
	const scope = missingScope(n, settings);
	if (scope) return "De flow heeft het recht voor deze stap niet. Zet het aan onder Instellingen › Rechten.";
	if (n.branches && n.branches.yes.length + n.branches.no.length === 0) return "Beide wegen van de splitsing zijn leeg.";
	return null;
}

/**
 * Walks the flow against a sample record, lighting each step for a beat. Nothing is saved or sent,
 * and no run is logged. A step that cannot run stops the test there.
 */
export async function simulateTest(id: string): Promise<TestResult | null> {
	const w = state[id];
	if (!w || w.nodes.length === 0 || activeRun?.nodeId) return null;
	const s = sampleFor(w.nodes[0]?.variantId, 4);
	const sample = { number: s.number, name: s.name };
	const path = w.nodes.flatMap((n) => (n.branches ? [n, ...(s.bigOrder ? n.branches.yes : n.branches.no)] : [n]));
	for (const n of path) {
		runStore.set({ automationId: id, nodeId: n.id });
		await new Promise((resolve) => setTimeout(resolve, STEP_MS));
		const reason = blocker(n, w.settings);
		if (reason) {
			runStore.set({ automationId: id, nodeId: null, failedId: n.id });
			return { ok: false, sample, nodeId: n.id, step: titleOf(n), reason };
		}
	}
	runStore.set(null);
	return { ok: true, sample, steps: path.length };
}

/** "Opnieuw" on a run: the same record and key, on the published version, and it goes through. */
export function rerun(id: string, run: WorkflowRun): WorkflowRun | null {
	const w = saved[id] ?? state[id];
	if (!w) return null;
	const next = makeRun(id, w.nodes, {
		n: w.runs + 1,
		at: new Date().toISOString(),
		status: "succeeded",
		version: w.version || 1,
		manual: true,
		...(run.record ? { record: run.record } : {}),
		...(run.key ? { key: run.key } : {}),
	});
	const r = { ...next, id: `run_${Date.now().toString(36)}`, cause: "Opnieuw gestart", ...(run.input ? { input: run.input } : {}) };
	workflowStore.recordRun(id, r);
	return r;
}
