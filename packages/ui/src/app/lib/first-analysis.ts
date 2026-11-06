import type { AgentActionId } from "./autonomy.ts";

/*
 * The first analysis (PLAN 45): what Insyte says straight after the store is connected.
 *
 * Two shapes. With enough history it returns one finding: the biggest operational problem, the
 * evidence for it in the store's own figures, a fix that is the standard answer to that problem, and
 * that fix already built. With too little history it does not guess. It says so, reads what the
 * store's setup already tells (shipping countries, delivery times, policies), asks a few questions
 * and lists what it watches for, with the amount of data each watch is waiting on.
 *
 * Every figure names its basis, and the expected effect is the store's own figures multiplied out,
 * never a benchmark from other stores (PRODUCT.md, Evidence on Hand).
 */

/** What can be prepared: an automation draft, the customer agent on drafts, a sheet. */
export type PreparedId = "automation" | "agent" | "sheet";

export type Evidence = {
	/** The figure as shown: "412 van 1.288". */
	figure: string;
	/** What it means, as a sentence. */
	says: string;
	/** Where it was read: "Inbox, laatste 90 dagen". */
	basis: string;
};

export type Finding = {
	/** The problem in one sentence. */
	headline: string;
	evidence: ReadonlyArray<Evidence>;
	fix: { title: string; why: string };
	/** The effect, computed from the evidence, with how. */
	effect: { figure: string; basis: string };
};

/** One thing read from the store's setup, and what it predicts. */
export type Prediction = { read: string; expect: string; prepares?: PreparedId };

export type Question = {
	id: string;
	ask: string;
	options: ReadonlyArray<{ id: string; label: string }>;
	initial: string;
};

/**
 * Asked whenever there is no finding, so the right things are prepared before the data is. Each
 * answer changes something: who ships decides whether forwarding is in the offline plan, and the
 * reply answer sets status replies to Zelf doen or Eerst vragen.
 */
export const QUESTIONS: ReadonlyArray<Question> = [
	{
		id: "fulfilment",
		ask: "Wie verstuurt je bestellingen?",
		options: [
			{ id: "one", label: "Eén leverancier" },
			{ id: "many", label: "Meerdere" },
			{ id: "self", label: "Ik zelf" },
		],
		initial: "one",
	},
	{
		id: "reply",
		ask: "Mag Insyte statusvragen zelf beantwoorden?",
		options: [
			{ id: "ask", label: "Eerst aan mij vragen" },
			{ id: "auto", label: "Ja, zelf doen" },
		],
		initial: "ask",
	},
];

/** What Insyte waits for before it judges something: `have` of `need`. */
export type Watch = { label: string; then: string; have: number; need: number };

export type FirstAnalysisSeed = {
	/** What the sync brought in, as the sync step counts it. */
	store: { products: number; customers: number; orders: number; mails: number; days: number };
	/** What the reading phase reads, in order. */
	reads: ReadonlyArray<string>;
	/** Present when the history is enough to judge. */
	finding?: Finding;
	/** Present when it is not: what the setup predicts and the watch list. */
	early?: {
		predictions: ReadonlyArray<Prediction>;
		watch: ReadonlyArray<Watch>;
	};
	/** The prepared items, in the words of this store. */
	prepared: Record<PreparedId, { title: string; does: string }>;
};

/** What Insyte may do while nobody is online, as the offline step lists it. */
export const OFFLINE_ACTIONS: ReadonlyArray<{ id: AgentActionId; night: string }> = [
	{ id: "ForwardOrder", night: "Betaalde bestellingen doorsturen naar de leverancier" },
	{ id: "ApplyLabel", night: "Nieuwe mail labelen en in de goede wachtrij zetten" },
	{ id: "SendReply", night: "Klanten antwoorden op vragen over hun bestelling" },
	{ id: "ApproveReturn", night: "Retouren goedkeuren die aan je beleid voldoen" },
	{ id: "RefundOrder", night: "Terugbetalingen" },
];

export type OfflineWindow = "evening" | "late" | "shifts";

export const OFFLINE_WINDOWS: ReadonlyArray<{ id: OfflineWindow; label: string; hint: string }> = [
	{ id: "evening", label: "Na 18:00 en in het weekend", hint: "De meeste winkels" },
	{ id: "late", label: "Na 22:00", hint: "Avonden werk je door" },
	{ id: "shifts", label: "Wisselend", hint: "Insyte kijkt wie er online is" },
];

/** The customer agent's opening hours for an offline window: open is when someone is online. */
export function hoursFor(w: OfflineWindow) {
	const day = (open: boolean, to: string) => ({ open, from: "09:00", to });
	if (w === "late") return [...Array.from({ length: 6 }, () => day(true, "22:00")), day(false, "22:00")];
	if (w === "shifts") return Array.from({ length: 7 }, () => day(true, "23:59"));
	return [...Array.from({ length: 5 }, () => day(true, "18:00")), day(false, "18:00"), day(false, "18:00")];
}
