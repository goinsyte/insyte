/*
 * How far the Insyte-agent may go on its own, per kind of action (ADR-0027).
 *
 * Every agent action is one entry of a fixed catalogue. A workspace holds one level per entry —
 * `auto` (Zelf doen), `ask` (Eerst vragen) or `never` (Nooit) — and `decide` answers, every time the
 * agent wants to act, whether it runs, becomes a proposal (the plate) or does not happen at all.
 *
 * Pure: no store, no React, no icons, so the rules can be tested on their own and every touchpoint
 * in the console asks the same function (the store wraps it in `useAutonomy().decide`).
 */

export type AutonomyLevel = "auto" | "ask" | "never";

export const LEVEL_LABEL: Record<AutonomyLevel, string> = { auto: "Zelf doen", ask: "Eerst vragen", never: "Nooit" };

export type ActionGroup = "Tickets en gesprekken" | "Bestellingen" | "Retouren" | "Leveranciers" | "Team" | "Geld";

export const ACTION_GROUPS: ReadonlyArray<ActionGroup> = ["Tickets en gesprekken", "Bestellingen", "Retouren", "Leveranciers", "Team", "Geld"];

export type AgentActionId =
	| "SetTicketStatus"
	| "SetPriority"
	| "AssignTicket"
	| "AddNote"
	| "ApplyLabel"
	| "CreateTicket"
	| "SnoozeThread"
	| "SendReply"
	| "ForwardOrder"
	| "CancelOrder"
	| "ApproveReturn"
	| "SendReturnLabel"
	| "MessageSupplier"
	| "RequestQualityCheck"
	| "PostChatMessage"
	| "RefundOrder"
	| "SubmitEvidence"
	| "AcceptDispute";

export type CatalogueEntry = {
	id: AgentActionId;
	group: ActionGroup;
	label: string;
	/** What Insyte does at Zelf doen, as the clause after "Insyte". */
	does: string;
	/** Speaks for the business or moves money: defaults to Eerst vragen and says so. */
	sensitive?: "money" | "contact";
	/**
	 * Cannot be set to Zelf doen, and why: the other side cannot take it back, or phase 1 holds it
	 * back until a per-amount ceiling exists. A locked row reads "Vraagt altijd".
	 */
	locked?: string;
};

export const CATALOGUE: ReadonlyArray<CatalogueEntry> = [
	{ id: "SetTicketStatus", group: "Tickets en gesprekken", label: "Ticketstatus wijzigen", does: "zet een ticket op Bezig, Wacht op antwoord of Klaar" },
	{ id: "SetPriority", group: "Tickets en gesprekken", label: "Prioriteit en deadline zetten", does: "zet de prioriteit en de deadline van een ticket" },
	{ id: "AssignTicket", group: "Tickets en gesprekken", label: "Toewijzen", does: "wijst tickets en gesprekken toe aan een collega" },
	{ id: "AddNote", group: "Tickets en gesprekken", label: "Interne notitie toevoegen", does: "schrijft een interne notitie bij een record" },
	{ id: "ApplyLabel", group: "Tickets en gesprekken", label: "Label toevoegen", does: "labelt tickets, gesprekken en bestellingen" },
	{ id: "CreateTicket", group: "Tickets en gesprekken", label: "Ticket aanmaken", does: "maakt een ticket aan uit een mail of een gesprek" },
	{ id: "SnoozeThread", group: "Tickets en gesprekken", label: "Gesprek uitstellen", does: "stelt een gesprek uit tot het weer aandacht vraagt" },
	{ id: "SendReply", group: "Tickets en gesprekken", label: "Klant beantwoorden", does: "stuurt een antwoord aan een klant", sensitive: "contact" },
	{ id: "ForwardOrder", group: "Bestellingen", label: "Bestelling doorsturen naar leverancier", does: "stuurt betaalde bestellingen door naar hun leverancier" },
	{ id: "CancelOrder", group: "Bestellingen", label: "Bestelling annuleren", does: "annuleert een bestelling", sensitive: "money", locked: "Na betaling kan Shopify een annulering niet terugdraaien" },
	{ id: "ApproveReturn", group: "Retouren", label: "Retour goedkeuren", does: "keurt een retour of claim goed die aan de regels voldoet" },
	{ id: "SendReturnLabel", group: "Retouren", label: "Retourlabel versturen", does: "stuurt de klant een retourlabel", sensitive: "contact" },
	{ id: "MessageSupplier", group: "Leveranciers", label: "Leverancier berichten", does: "stuurt een leverancier een bericht", sensitive: "contact" },
	{ id: "RequestQualityCheck", group: "Leveranciers", label: "Kwaliteitscontrole aanvragen", does: "vraagt een leverancier om foto's of een monster van een batch", sensitive: "contact" },
	{ id: "PostChatMessage", group: "Team", label: "Bericht in teamchat plaatsen", does: "plaatst een bericht in een kanaal van het team", sensitive: "contact" },
	{ id: "RefundOrder", group: "Geld", label: "Terugbetalen", does: "betaalt een klant terug", sensitive: "money", locked: "Terugbetalingen vragen altijd, tot er een grens per bedrag is" },
	{ id: "SubmitEvidence", group: "Geld", label: "Chargeback-bewijs indienen", does: "dient een bewijspakket in", sensitive: "money", locked: "Kan bij Klarna, Stripe en PayPal niet worden teruggedraaid" },
	{ id: "AcceptDispute", group: "Geld", label: "Geschil accepteren", does: "accepteert een geschil", sensitive: "money", locked: "Een geaccepteerd geschil is verloren en komt niet terug" },
];

export const ENTRY: Record<AgentActionId, CatalogueEntry> = Object.fromEntries(CATALOGUE.map((e) => [e.id, e])) as Record<AgentActionId, CatalogueEntry>;

/** What no setting reaches: these are not in the catalogue at all. */
export const NEVER_REACHABLE = ["records verwijderen", "rollen, teamleden, sleutels, facturatie of koppelingen wijzigen", "deze instellingen zelf aanpassen"];

export type Policy = Record<AgentActionId, AutonomyLevel>;

/** The defaults ADR-0027 seeds on every workspace: everything asks first until the operator says otherwise. */
export const DEFAULT_POLICY: Policy = Object.fromEntries(CATALOGUE.map((e) => [e.id, "ask"])) as Policy;

/** A policy with every catalogue entry present, whatever was stored, and locked rows held at their ceiling. */
export function normalise(partial: Partial<Record<string, AutonomyLevel>>): Policy {
	const out = { ...DEFAULT_POLICY };
	for (const e of CATALOGUE) {
		const v = partial[e.id];
		if (v === "auto" || v === "ask" || v === "never") out[e.id] = e.locked && v === "auto" ? "ask" : v;
	}
	return out;
}

export const canBeAuto = (id: AgentActionId) => ENTRY[id].locked === undefined;

export type Decision = "run" | "propose" | "refuse";

export type DecideContext = {
	/** The workspace's AI budget is spent: nothing runs on its own until the month turns or it is raised. */
	budgetSpent?: boolean;
	/** Started by a person: whether that person may do this themselves. The agent never exceeds them. */
	personMay?: boolean;
};

/**
 * Whether the agent may do `id` now. `run` executes the same use case a person's button runs;
 * `propose` draws the plate; `refuse` means the action does not happen and nothing is shown.
 */
export function decide(policy: Partial<Policy>, id: AgentActionId, ctx: DecideContext = {}): Decision {
	const entry = ENTRY[id];
	if (!entry) return "refuse";
	if (ctx.personMay === false) return "refuse";
	const level = policy[id] ?? DEFAULT_POLICY[id];
	if (level === "never") return "refuse";
	if (entry.locked) return "propose";
	if (ctx.budgetSpent) return "propose";
	return level === "auto" ? "run" : "propose";
}

/** What the policy lets Insyte do on its own, as the sentences the settings page shows beside the matrix. */
export function describePolicy(policy: Policy): string[] {
	const at = (l: AutonomyLevel) => CATALOGUE.filter((e) => policy[e.id] === l);
	const out: string[] = [];
	const auto = at("auto");
	const never = at("never");
	if (auto.length === 0) out.push("Insyte doet niets op eigen houtje. Alles komt eerst als voorstel bij jou.");
	else out.push(`Insyte ${joinNl(auto.map((e) => e.does))}, en zet elke actie in het logboek.`);
	const ask = at("ask").filter((e) => !e.locked);
	if (ask.length) out.push(`Vraagt eerst bij: ${joinNl(ask.map((e) => lowerFirst(e.label)))}.`);
	out.push(`Vraagt altijd bij ${joinNl(CATALOGUE.filter((e) => e.locked && policy[e.id] !== "never").map((e) => lowerFirst(e.label)))}.`);
	if (never.length) out.push(`Doet nooit: ${joinNl(never.map((e) => lowerFirst(e.label)))}.`);
	return out;
}

export type PolicyChange = { id: AgentActionId; label: string; from: AutonomyLevel; to: AutonomyLevel; more: boolean };

const RANK: Record<AutonomyLevel, number> = { never: 0, ask: 1, auto: 2 };

/** Row by row, what is different between two policies. `more` is more freedom for the agent. */
export function diffPolicy(base: Policy, next: Policy): PolicyChange[] {
	return CATALOGUE.filter((e) => base[e.id] !== next[e.id]).map((e) => ({
		id: e.id,
		label: e.label,
		from: base[e.id],
		to: next[e.id],
		more: RANK[next[e.id]] > RANK[base[e.id]],
	}));
}

/* ── spend ─────────────────────────────────────────────────────────────────────────────────── */

export type BudgetState = "ok" | "warn" | "spent";

/** Where a budget stands: amber from 80%, spent at 100%. No limit is always fine. */
export function budgetState(used: number, limit: number | null): BudgetState {
	if (limit === null || limit <= 0) return limit === 0 ? "spent" : "ok";
	const share = used / limit;
	return share >= 1 ? "spent" : share >= 0.8 ? "warn" : "ok";
}

export const budgetShare = (used: number, limit: number | null) => (limit === null || limit <= 0 ? 0 : Math.min(1, used / limit));

/* ── undo window ───────────────────────────────────────────────────────────────────────────── */

/**
 * How long an agent action can be taken back from the log: five minutes, the same server window a
 * person's action has (ADR-0023), longer than the six-second toast because the agent does not toast.
 */
export const UNDO_WINDOW_MS = 5 * 60_000;

export function undoLeft(undoUntil: number | undefined, now: number): number {
	return undoUntil === undefined ? 0 : Math.max(0, undoUntil - now);
}

/* ── words ─────────────────────────────────────────────────────────────────────────────────── */

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function joinNl(parts: ReadonlyArray<string>): string {
	return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} en ${parts.at(-1)}`;
}

/* ── the seed a host supplies ──────────────────────────────────────────────────────────────── */

export type PolicyHistoryEntry = {
	id: string;
	at: string;
	by: string;
	version: number;
	changes: ReadonlyArray<{ id: AgentActionId; from: AutonomyLevel; to: AutonomyLevel }>;
};

export type PersonBudget = { memberId: string; limit: number | null; used: number };

export type AutonomySeed = {
	policy: Partial<Policy>;
	version: number;
	budget: { limit: number | null; used: number };
	people: ReadonlyArray<PersonBudget>;
	/** What the background agent and the customer agent spent this month, in euros. */
	background: number;
	history: ReadonlyArray<PolicyHistoryEntry>;
};
