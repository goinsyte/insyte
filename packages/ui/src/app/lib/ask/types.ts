/*
 * What an Ask Insyte turn is made of, apart from where it comes from: the design app's scripts (`scripts.ts`) and the
 * console's streamed answers both draw through these.
 */

export type RefKind = "order" | "chargeback" | "ticket" | "customer" | "supplier" | "store";
/**
 * A word, a record as a chip, or a figure: a number the host computed, with what it is and where its rows are (the
 * console's answers place every number this way, so each one opens where it was counted). A figure's `search` is the
 * page's own query, such as Analyse's `explain` that opens the figure's explanation over the page.
 */
export type Token =
	| { t: string }
	| { ref: string; to: string; kind: RefKind }
	| { figure: string; label: string; to: string; search?: Readonly<Record<string, unknown>> };

/** A token as plain text: the words, a record's name, a figure's value. */
export const plainOf = (tokens: ReadonlyArray<Token>) =>
	tokens.map((t) => ("ref" in t ? t.ref : "figure" in t ? t.figure : t.t)).join("");

export type ProposalAction =
	| { kind: "file-queue"; queueId: string; label: string }
	| { kind: "supplier-ticket"; supplier: string; orders: ReadonlyArray<string> }
	| { kind: "send-reply"; to: string; body: string }
	| { kind: "open"; to: string };

export type Proposal = {
	title: string;
	body: string;
	/** 0–100. Shown as a measured bar, never as a bare percentage. */
	confidence: number;
	why: string;
	fileLabel: string;
	action: ProposalAction;
};

export type Source = { kind: RefKind | "queue"; title: string; detail: string; to: string };
export type Tool = { verb: string; object: string };

export type Script = {
	steps: ReadonlyArray<string>;
	tools: ReadonlyArray<Tool>;
	answer: ReadonlyArray<Token>;
	sources: ReadonlyArray<Source>;
	proposal?: Proposal;
	followUps: ReadonlyArray<string>;
};

export const COMMANDS: ReadonlyArray<{ name: string; hint: string; prompt: string }> = [
	{ name: "samenvatten", hint: "Wat vandaag op jou wacht", prompt: "Vat de open zaken van vandaag samen" },
	{ name: "vertragingen", hint: "Bestellingen die te laat dreigen te komen", prompt: "Welke bestellingen dreigen te laat te komen?" },
	{ name: "opstellen", hint: "Een antwoord aan een klant", prompt: "Stel een antwoord op aan Daniel over zijn vertraagde levering" },
	{ name: "chargebacks", hint: "Zaken die op bewijs wachten", prompt: "Welke chargebacks hebben bewijs nodig?" },
];

export type Decision = "open" | "filed" | "discarded";
export type Turn =
	| { id: string; role: "user"; text: string }
	| {
			id: string;
			role: "assistant";
			script: Script;
			settled: boolean;
			decision: Decision;
			/**
			 * A turn the host streams as it happens (the console's): where it is now, and how long it thought. The thread
			 * draws it as it stands instead of playing it.
			 */
			live?: { phase: "thinking" | "streaming" | "settled"; seconds: number } | undefined;
		};
