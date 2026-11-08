import {
	AtSign,
	Box,
	CornerDownLeft,
	type IconComponent,
	Plug,
	RotateCcw,
	ShoppingBag,
	Sparkle,
	Ticket,
	Truck,
	Users,
	Wallet,
	Workflow,
} from "../../icons";
import type { Persona } from "./types/persona";

/*
 * Notifications, as one model the topbar dropdown, the notifications page and the settings page all
 * read. A notification is a fact about a record — who did what to which order, ticket or case — with
 * a place in the operator's attention: in the inbox, set aside until later, or cleared.
 *
 * Every notification names the event it is an instance of. The event is what settings speak about
 * ("Nieuwe chargeback", per channel), so a switch turned off there is the same switch that keeps the
 * row out of the inbox and the dropdown.
 */

/** Where a notification comes from: the part of the product, or the service, that raised it. */
export type NoteSource =
	| "order"
	| "ticket"
	| "chargeback"
	| "supplier"
	| "automation"
	| "mention"
	| "team"
	| "integration"
	| "insyte"
	| "payout"
	| "brand"
	| "return";

export const SOURCES: Record<NoteSource, { label: string; icon: IconComponent }> = {
	order: { label: "Bestellingen", icon: ShoppingBag },
	ticket: { label: "Tickets", icon: Ticket },
	chargeback: { label: "Chargebacks", icon: CornerDownLeft },
	supplier: { label: "Leveranciers", icon: Truck },
	automation: { label: "Automatiseringen", icon: Workflow },
	mention: { label: "Vermeldingen", icon: AtSign },
	team: { label: "Team", icon: Users },
	integration: { label: "Koppelingen", icon: Plug },
	insyte: { label: "Insyte", icon: Sparkle },
	payout: { label: "Uitbetalingen", icon: Wallet },
	brand: { label: "Northwind", icon: Box },
	return: { label: "Retouren", icon: RotateCcw },
};

/** The order the sources are listed in, in the panel and in settings. */
export const SOURCE_ORDER: ReadonlyArray<NoteSource> = [
	"mention",
	"insyte",
	"order",
	"return",
	"ticket",
	"chargeback",
	"supplier",
	"automation",
	"team",
	"integration",
	"payout",
	"brand",
];

export type Channel = "app" | "email" | "push" | "slack";
export const CHANNELS: ReadonlyArray<{ id: Channel; label: string; short: string }> = [
	{ id: "app", label: "In de app", short: "App" },
	{ id: "email", label: "E-mail", short: "E-mail" },
	{ id: "push", label: "Mobiel push", short: "Push" },
	{ id: "slack", label: "Slack", short: "Slack" },
];

export type EventKey =
	| "order.late"
	| "order.refund"
	| "order.note"
	| "return.new"
	| "return.received"
	| "ticket.assigned"
	| "ticket.reply"
	| "ticket.sla"
	| "chargeback.new"
	| "chargeback.deadline"
	| "chargeback.result"
	| "supplier.delay"
	| "supplier.message"
	| "supplier.stock"
	| "automation.failed"
	| "automation.done"
	| "chat.mention"
	| "team.invite"
	| "team.access"
	| "integration.disconnected"
	| "integration.sync"
	| "insyte.proposal"
	| "insyte.draft"
	| "insyte.report"
	| "insyte.action"
	| "insyte.budget"
	| "partner.work"
	| "partner.money";

export type EventGroup = "Bestellingen" | "Retouren" | "Klantenservice" | "Chargebacks" | "Leveranciers" | "Automatiseringen" | "Team" | "Koppelingen" | "Insyte";

export type EventDef = {
	key: EventKey;
	group: EventGroup;
	label: string;
	detail: string;
	/** Lands in Primair: it asks something of the operator. The rest is Overig. */
	primary: boolean;
	/** Offers "Alleen als het mij betreft": only records I am assigned to, mentioned in or made. */
	mine?: boolean;
	/** A threshold that decides when it fires, kept on the Account page. */
	threshold?: "delayHours" | "disputeAmount";
	defaults: Record<Channel, boolean>;
};

const ch = (app: boolean, email: boolean, push: boolean, slack: boolean) => ({ app, email, push, slack });

/** Every event the admin can hear about, grouped the way settings lists them. */
export const EVENTS: ReadonlyArray<EventDef> = [
	{ key: "order.late", group: "Bestellingen", label: "Bestelling te laat", detail: "Nog niet verzonden na de drempel.", primary: true, mine: true, threshold: "delayHours", defaults: ch(true, true, false, false) },
	{ key: "order.refund", group: "Bestellingen", label: "Terugbetaald of geannuleerd", detail: "Iemand uit het team heeft geld teruggegeven of een bestelling gestopt.", primary: false, mine: true, defaults: ch(true, false, false, false) },
	{ key: "order.note", group: "Bestellingen", label: "Notitie of label", detail: "Een collega schreef iets bij een bestelling.", primary: false, mine: true, defaults: ch(true, false, false, false) },
	{ key: "return.new", group: "Retouren", label: "Nieuwe retour of claim", detail: "Een klant vraagt een retour aan of meldt een probleem in het retourportaal.", primary: true, defaults: ch(true, false, false, false) },
	{ key: "return.received", group: "Retouren", label: "Pakket ontvangen", detail: "Een retourpakket is binnen en kan worden afgehandeld.", primary: false, defaults: ch(true, false, false, false) },
	{ key: "ticket.assigned", group: "Klantenservice", label: "Ticket aan jou toegewezen", detail: "Iemand legt een ticket bij jou neer.", primary: true, defaults: ch(true, true, true, false) },
	{ key: "ticket.reply", group: "Klantenservice", label: "Klant antwoordt", detail: "Een nieuw bericht in een open ticket.", primary: false, mine: true, defaults: ch(true, false, false, false) },
	{ key: "ticket.sla", group: "Klantenservice", label: "Termijn dreigt te verlopen", detail: "Een ticket heeft binnen 4 uur een eerste antwoord nodig.", primary: true, mine: true, defaults: ch(true, false, true, false) },
	{ key: "chargeback.new", group: "Chargebacks", label: "Nieuwe chargeback", detail: "Een klant betwist een betaling.", primary: true, threshold: "disputeAmount", defaults: ch(true, true, false, false) },
	{ key: "chargeback.deadline", group: "Chargebacks", label: "Bewijsdeadline nadert", detail: "Nog 24 uur om bewijs in te dienen.", primary: true, defaults: ch(true, true, true, false) },
	{ key: "chargeback.result", group: "Chargebacks", label: "Uitspraak", detail: "Een geschil is gewonnen of verloren.", primary: false, defaults: ch(true, true, false, false) },
	{ key: "supplier.delay", group: "Leveranciers", label: "Vertraging gemeld", detail: "Een leverancier verschuift een overdrachtsdatum.", primary: true, mine: true, defaults: ch(true, true, false, false) },
	{ key: "supplier.message", group: "Leveranciers", label: "Bericht van een leverancier", detail: "In het gedeelde kanaal met die leverancier.", primary: false, defaults: ch(true, false, false, true) },
	{ key: "supplier.stock", group: "Leveranciers", label: "Voorraad bijna op", detail: "Een product raakt op binnen een week, op het huidige tempo.", primary: false, defaults: ch(true, false, false, false) },
	{ key: "automation.failed", group: "Automatiseringen", label: "Uitvoering mislukt", detail: "Een stap in een flow kon niet worden uitgevoerd.", primary: true, defaults: ch(true, true, false, true) },
	{ key: "automation.done", group: "Automatiseringen", label: "Flow aangezet of gepauzeerd", detail: "Iemand verandert een flow die voor de werkruimte draait.", primary: false, defaults: ch(true, false, false, false) },
	{ key: "chat.mention", group: "Team", label: "Vermelding", detail: "Iemand noemt je met @ in een chat of reactie.", primary: true, defaults: ch(true, false, true, true) },
	{ key: "team.invite", group: "Team", label: "Uitnodigingen", detail: "Geaccepteerd, of bijna verlopen.", primary: false, defaults: ch(true, true, false, false) },
	{ key: "team.access", group: "Team", label: "Toegangsverzoeken", detail: "Iemand vraagt om meer rechten, of er komt antwoord op een verzoek.", primary: true, defaults: ch(true, false, false, false) },
	{ key: "integration.disconnected", group: "Koppelingen", label: "Koppeling verbroken", detail: "Een dienst geeft Insyte geen toegang meer.", primary: true, defaults: ch(true, true, false, false) },
	{ key: "integration.sync", group: "Koppelingen", label: "Synchronisatie met fouten", detail: "Een sync is klaar, maar sloeg records over.", primary: false, defaults: ch(true, false, false, false) },
	{ key: "insyte.proposal", group: "Insyte", label: "Voorstel klaar", detail: "Insyte heeft iets getekend dat jij kunt uitvoeren of negeren.", primary: true, defaults: ch(true, false, true, false) },
	{ key: "insyte.draft", group: "Insyte", label: "Concepten opgesteld", detail: "Antwoorden staan klaar om na te lezen.", primary: false, defaults: ch(true, false, false, false) },
	{ key: "insyte.report", group: "Insyte", label: "Weekrapport", detail: "Elke maandag, wat er vorige week bewoog.", primary: false, defaults: ch(true, true, false, false) },
	{ key: "insyte.action", group: "Insyte", label: "Actie mislukt of teruggedraaid", detail: "Iets wat Insyte zelf deed, mislukte of werd door een collega ongedaan gemaakt.", primary: true, defaults: ch(true, false, false, false) },
	{ key: "insyte.budget", group: "Insyte", label: "AI-budget bijna op", detail: "Bij 80% en 100% van het maandbudget, voor de werkruimte of voor jou.", primary: true, defaults: ch(true, true, false, false) },
];

/* A supplier's and an affiliate's notifications are about their own work and money only; their own
   settings speak about them, so these two never appear on the admin's settings page. */
const PARTNER_EVENTS: Record<"partner.work" | "partner.money", { primary: boolean }> = {
	"partner.work": { primary: true },
	"partner.money": { primary: false },
};

export const EVENT_GROUPS: ReadonlyArray<{ group: EventGroup; icon: IconComponent }> = [
	{ group: "Bestellingen", icon: ShoppingBag },
	{ group: "Retouren", icon: RotateCcw },
	{ group: "Klantenservice", icon: Ticket },
	{ group: "Chargebacks", icon: CornerDownLeft },
	{ group: "Leveranciers", icon: Truck },
	{ group: "Automatiseringen", icon: Workflow },
	{ group: "Team", icon: Users },
	{ group: "Koppelingen", icon: Plug },
	{ group: "Insyte", icon: Sparkle },
];

const BY_KEY = new Map(EVENTS.map((e) => [e.key, e]));
export const eventDef = (key: EventKey) => BY_KEY.get(key);

/* ── the notification ─────────────────────────────────────────────────────────────────────── */

/** Who did it: a teammate (with presence), another person, a connected service, or Insyte itself. */
export type NoteActor =
	| { kind: "member"; id: string; name: string }
	| { kind: "person"; name: string; org?: string }
	| { kind: "brand"; brand: string; name: string }
	| { kind: "insyte" };

/** The record it is about, read live from the workspace when the preview opens. */
export type NoteRef =
	| { type: "order"; id: string }
	| { type: "ticket"; id: string }
	| { type: "chargeback"; id: string }
	| { type: "automation"; id: string }
	| { type: "proposal"; id: string }
	| { type: "conversation"; id: string; name: string }
	| { type: "member"; id: string }
	| { type: "integration"; key: string };

export type NoteState = "inbox" | "later" | "cleared";

export type Note = {
	id: string;
	persona: Persona;
	source: NoteSource;
	event: EventKey;
	actor?: NoteActor;
	/** Why it reached me directly: someone wrote my name, or handed me the work. */
	reason?: "mention" | "assign";
	/** Why I follow the record it is about, for updates on records that are not addressed to me. */
	via?: "assigned" | "mentioned" | "created";
	/** The sentence after the actor's name; the record follows it. */
	title: string;
	record?: string;
	/** One line under the title: a quote, the amount, what happens next. */
	detail?: string;
	/** The detail is something a person wrote. */
	quote?: boolean;
	/** A signal for a row nobody did: amber for a deadline, red for a failure, green for a win. */
	tone?: "amber" | "red" | "green";
	to: string;
	search?: Record<string, string>;
	ref?: NoteRef;
	/** Facts for the preview when the record is not one the workspace holds. */
	facts?: ReadonlyArray<readonly [string, string]>;
	at: string;
	read: boolean;
	state: NoteState;
	snoozeUntil?: string;
};

export const isPrimary = (n: Note) =>
	n.reason !== undefined || (n.event in PARTNER_EVENTS ? PARTNER_EVENTS[n.event as keyof typeof PARTNER_EVENTS].primary : (eventDef(n.event)?.primary ?? false));

/** Set aside until a time that has passed: it is back in the inbox. */
export const stateOf = (n: Note, now: number): NoteState =>
	n.state === "later" && n.snoozeUntil !== undefined && Date.parse(n.snoozeUntil) <= now ? "inbox" : n.state;

/* ── what the operator wants to hear ──────────────────────────────────────────────────────── */

export type EventPref = Record<Channel, boolean> & { onlyMine: boolean };
export type NotifyPrefs = {
	events: Record<string, EventPref>;
	quiet: { on: boolean; from: string; to: string; weekend: boolean };
	digest: { on: boolean; at: string };
	follow: { assigned: boolean; mentioned: boolean; created: boolean };
	slackChannel: string;
};

export const DEFAULT_PREFS: NotifyPrefs = {
	events: Object.fromEntries(EVENTS.map((e) => [e.key, { ...e.defaults, onlyMine: false }])),
	quiet: { on: true, from: "22:00", to: "07:00", weekend: false },
	digest: { on: true, at: "08:00" },
	follow: { assigned: true, mentioned: true, created: true },
	slackChannel: "#northwind-ops",
};

const concernsMe = (n: Note) => n.reason !== undefined || n.via !== undefined;

/**
 * Whether a notification shows in the app at all. A supplier and an affiliate keep their own
 * switches elsewhere; for the admin, the event's "In de app" switch, "Alleen als het mij betreft"
 * and the follow rules decide.
 */
export function heard(n: Note, prefs: NotifyPrefs): boolean {
	if (n.persona !== "admin") return true;
	const p = prefs.events[n.event];
	if (p && !p.app) return false;
	if (p?.onlyMine && !concernsMe(n)) return false;
	if (n.via && n.reason === undefined && !prefs.follow[n.via]) return false;
	return true;
}

/* ── time ─────────────────────────────────────────────────────────────────────────────────── */

const startOfDay = (t: number) => {
	const d = new Date(t);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
};

export type DayGroup = "Vandaag" | "Gisteren" | "Deze week" | "Eerder";
export const DAY_GROUPS: ReadonlyArray<DayGroup> = ["Vandaag", "Gisteren", "Deze week", "Eerder"];

export function dayGroup(at: string, now: number): DayGroup {
	const days = Math.round((startOfDay(now) - startOfDay(Date.parse(at))) / 86_400_000);
	if (days <= 0) return "Vandaag";
	if (days === 1) return "Gisteren";
	if (days < 7) return "Deze week";
	return "Eerder";
}

const TIME = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("nl-NL", { weekday: "short" });
const DATE = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

/** The row's time: the clock today and yesterday, the weekday this week, the date before that. */
export function noteTime(at: string, now: number): string {
	const g = dayGroup(at, now);
	const d = new Date(at);
	if (g === "Vandaag" || g === "Gisteren") return TIME.format(d);
	if (g === "Deze week") return `${WEEKDAY.format(d).replace(".", "")} ${TIME.format(d)}`;
	return DATE.format(d).replace(".", "");
}

export const fullTime = (at: string) =>
	new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(at));

/** The snooze menu's choices, worked out from now: this afternoon (or in three hours), tomorrow, next week. */
export function snoozeChoices(now: number): ReadonlyArray<{ id: string; label: string; until: string; hint: string }> {
	const at = (days: number, h: number) => {
		const d = new Date(now);
		d.setDate(d.getDate() + days);
		d.setHours(h, 0, 0, 0);
		return d;
	};
	const afternoon = at(0, 15);
	const soon = afternoon.getTime() - now > 30 * 60_000 ? { id: "afternoon", label: "Vanmiddag", until: afternoon } : { id: "later", label: "Over 3 uur", until: new Date(now + 3 * 3_600_000) };
	const monday = at(((8 - new Date(now).getDay()) % 7) || 7, 9);
	return [
		{ ...soon, until: soon.until.toISOString(), hint: TIME.format(soon.until) },
		{ id: "tomorrow", label: "Morgen", until: at(1, 9).toISOString(), hint: `${WEEKDAY.format(at(1, 9)).replace(".", "")} 09:00` },
		{ id: "week", label: "Volgende week", until: monday.toISOString(), hint: `${DATE.format(monday).replace(".", "")} 09:00` },
	];
}

/** "morgen 09:00", "vanmiddag 15:00": when a snoozed notification comes back. */
export function wakesAt(until: string, now: number): string {
	const d = Date.parse(until);
	const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
	const t = TIME.format(new Date(d));
	if (days <= 0) return `vandaag ${t}`;
	if (days === 1) return `morgen ${t}`;
	return `${DATE.format(new Date(d)).replace(".", "")} ${t}`;
}

