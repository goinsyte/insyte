/**
 * The record shapes the seam carries that used to be declared beside their fixtures.
 *
 * Moved here verbatim — each block under the heading of the file it came from — because a type is
 * part of the contract a host has to meet, and the contract cannot live in a host. The fixture files
 * import these back and re-export them, so nothing that named them there changed.
 */
import type { TIERS } from "./index"

/* ── from apps/console/src/lib/affiliate-data.ts ── */

export type Conversion = { id: string; link: string; at: string; order: string; title: string; total: number; commission: number; status: ConversionStatus };

/**
 * A conversion waits out the 14-day return window, is then approved, and is paid on the 15th of the
 * month after it came in. A return inside the window takes the commission back.
 */
export type ConversionStatus = "pending" | "approved" | "paid" | "reversed";

export type AffStatement = {
	id: string;
	label: string;
	rows: Conversion[];
	/** Commission on every order that came in. */
	gross: number;
	/** Commission taken back for orders that were returned. */
	reversed: number;
	total: number;
	status: "paid" | "open";
	payDay: number;
};

/* ── from apps/console/src/lib/mock-data/affiliate-program.ts ── */

export type Tier = (typeof TIERS)[number]["id"];

export type Application = {
	id: string;
	name: string;
	email: string;
	channel: string;
	audience: string;
	motivation: string;
	appliedAt: number;
	status: "pending" | "approved" | "rejected";
	reason?: string;
	decidedAt?: number;
};

export type ProgramAffiliate = {
	id: string;
	name: string;
	email: string;
	code: string;
	tier: Tier;
	rate: number;
	joinedAt: number;
	conversions: number;
	/** Commission earned to date, returns taken off. */
	earned: number;
	paused?: boolean;
};

export type PayoutLine = {
	affiliateId: string;
	name: string;
	method: string;
	orders: number;
	/** Past the 14-day return window: can be approved now. */
	approvable: number;
	/** Still inside the window: approved by itself once it is through. */
	inWindow: number;
	reversed: number;
};

export type AffiliateInvite = {
	id: string;
	name: string;
	email: string;
	tier: Tier;
	message?: string;
	sentAt: number;
	expiresAt: number;
};

/* ── from apps/console/src/lib/mock-data/resources.ts ── */

export type AffiliateResource = {
	id: string;
	name: string;
	kind: "logo" | "image" | "video" | "doc" | "guide";
	size: string;
	updated_at: string;
};

/* ── from apps/console/src/lib/mock-data/chats.ts ── */

export type ChatReaction = { emoji: string; count: number; mine?: boolean };

export type ChatCard =
	| {
			type: "chargeback";
			title: string;
			subtitle: string;
			amount?: string;
			href?: string;
	  }
	| {
			type: "order";
			title: string;
			subtitle: string;
			href?: string;
	  }
	| {
			type: "ai";
			headline: string;
			body: string;
			cta?: string;
	  };

/** A record a message carries: shared from the app with # or picked up by a command. */
export type ChatRecordKind = "order" | "customer" | "product" | "chargeback" | "ticket";
export type ChatRecordRef = { kind: ChatRecordKind; id: string };

/** The app actions a conversation can run, by a person's /command or proposed by Insyte. */
export type ChatCommandId = "refund" | "cancel" | "note" | "ticket" | "assign" | "status" | "evidence" | "accept";

/**
 * An action in a conversation. A person's money action waits on `confirm`; Insyte's waits on
 * `proposed` when the autonomy rules say Eerst vragen. Once it ran it can be undone for a while.
 */
export type ChatAction = {
	id: string;
	command: ChatCommandId;
	target?: ChatRecordRef;
	/** Free text the command carries: a note, a ticket title, a status, a person. */
	arg?: string;
	by: "person" | "insyte";
	state: "confirm" | "proposed" | "running" | "done" | "undone" | "declined" | "failed";
	/** The autonomy level Insyte acted under; absent for a person's own action. */
	level?: "auto" | "ask";
	/** Who approved or declined it, when it was not the one who started it. */
	decidedBy?: string;
	undoUntil?: number;
	/** Why it did not run, in the words the card shows. */
	error?: string;
};

export type RichMessage = {
	id: string;
	conversation_id: string;
	sender_id: string;
	sender_name: string;
	body: string; // may contain `code` segments by convention via markdown-like backticks
	at: string;
	reactions?: ChatReaction[];
	card?: ChatCard;
	attachments?: Array<{ id: string; name: string; size: number; type: string }>;
	/** Records shared into the message, drawn as live cards that open beside the conversation. */
	records?: ChatRecordRef[];
	action?: ChatAction;
	edited_at?: string;
};

/** Who someone in a conversation is, for the card that opens on their name. */
export type ChatProfile = {
	name: string;
	title: string;
	email?: string;
	/** IANA zone, for "14:32 bij hen". */
	timezone: string;
	presence: "online" | "away" | "offline";
	/** What they are doing now, in a few words. */
	status?: string;
	/** The workspace member behind the chat identity, when there is one. */
	memberId?: string;
	/** Insyte itself: it gets the agent card, not a person's. */
	agent?: boolean;
};

/* ── from apps/console/src/lib/mock-data/plates.ts ── */

export type Signal = "red" | "amber" | "green" | "idle";

export type QueueRow = {
	id: string;
	signal: Signal;
	/** What happened, in the product's own words. One line, no truncation games. */
	title: string;
	store: string;
	/** Already formatted, in the store's own currency, because that is what the operator reads. */
	value: string;
	/** Time left, or an em dash when nothing is owed. */
	due: string;
	/** Present when Insyte has drawn a plate for this row. */
	plate?: Plate;
};

export type Plate = {
	/** The drawing's number, which is the record's own case or order number. */
	number: string;
	heading: string;
	/** One paragraph. What was gathered, and what filing it would do. */
	body: string;
	/** The dimension across the top of the drawing: how long is left. */
	dimension: string;
	/** The record as it stands, and as the plate would leave it. */
	before: { label: string; value: string };
	after: { label: string; value: string };
	/** What the leader line between them says. */
	change: string;
	/** The witness line out to the store the record belongs to. */
	witness: string;
	/** The title block at the foot, where a real technical drawing puts it. */
	state: string;
	confidence: string;
	/** The primary action names what filing does, not "Submit". */
	fileLabel: string;
	/**
	 * What the stamp says once filed, where filing has not done it yet: "Wordt verstuurd…" for a mail that waits out
	 * the undo window. Absent, the stamp says "Uitgevoerd".
	 */
	filed?: string | undefined;
};

/* ── from apps/console/src/lib/mock-data/members.ts ── */

export type Presence = "online" | "away" | "offline";

/* ── from apps/console/src/lib/scenario.ts ── */

export type Scenario = "empty" | "settled" | "busy";
