import type { IconComponent } from "../../icons";
import {
	AlertTriangle,
	BarChart3,
	Bell,
	Box,
	Calendar,
	ClipboardCheck,
	Clock,
	CreditCard,
	Filter,
	GitMerge,
	Hash,
	Inbox,
	Link2,
	Mail,
	MessageCircle,
	MessageSquare,
	Package,
	PiggyBank,
	Receipt,
	RefreshCcw,
	Route,
	Send,
	ShieldAlert,
	ShieldCheck,
	ShoppingBag,
	Sparkles,
	Split,
	Star,
	Tag,
	Ticket as TicketIcon,
	Truck,
	UserPlus,
	UserSearch,
	Webhook,
	Zap,
} from "../../icons";

/**
 * Every step a flow can have. A step is one of four kinds; an action is Insyte's own, an AI step
 * (drawn dark, because it is the product proposing), or a step in a connected service, which carries
 * that service's logo. Each action names the right it needs (`scope`), which is what the flow's
 * service account is granted under Instellingen.
 */
export type NodeKind = "trigger" | "condition" | "delay" | "action" | "branch";

export type NodeField =
	| { key: string; label: string; type: "text" | "textarea" | "number"; placeholder?: string; required?: boolean }
	| { key: string; label: string; type: "select"; options: { value: string; label: string }[] }
	| { key: string; label: string; type: "switch" };

export type NodeVariant = {
	id: string;
	kind: NodeKind;
	label: string;
	description: string;
	icon: IconComponent;
	/** The palette group. */
	category: string;
	/** A connected service: its logo stands in for the glyph. */
	brand?: string;
	/** An AI step. */
	ai?: boolean;
	/** The right the step needs, from SCOPES. */
	scope?: string;
	defaultConfig: Record<string, unknown>;
	fields: NodeField[];
};

const trig = (id: string, label: string, description: string, icon: IconComponent, brand?: string): NodeVariant => ({
	id,
	kind: "trigger",
	label,
	description,
	icon,
	category: "Triggers",
	...(brand ? { brand } : {}),
	defaultConfig: {},
	fields: [],
});

type ActionOpts = {
	brand?: string;
	ai?: boolean;
	scope?: string;
	defaults?: Record<string, unknown>;
	fields?: NodeField[];
};

const act = (id: string, label: string, description: string, icon: IconComponent, category: string, o: ActionOpts = {}): NodeVariant => ({
	id,
	kind: "action",
	label,
	description,
	icon,
	category,
	...(o.brand ? { brand: o.brand } : {}),
	...(o.ai ? { ai: true } : {}),
	...(o.scope ? { scope: o.scope } : {}),
	defaultConfig: o.defaults ?? {},
	fields: o.fields ?? [],
});

const MESSAGE: NodeField[] = [
	{ key: "to", label: "Aan", type: "text", placeholder: "{{customer.email}}", required: true },
	{ key: "subject", label: "Onderwerp", type: "text" },
	{ key: "body", label: "Bericht", type: "textarea" },
];

const CHANNEL: NodeField[] = [
	{ key: "channel", label: "Kanaal", type: "text", placeholder: "#cx", required: true },
	{ key: "text", label: "Bericht", type: "textarea" },
];

export const NODE_VARIANTS: NodeVariant[] = [
	/* ── triggers ───────────────────────────────────────────────────────────────────────────── */
	trig("trigger.order_placed", "Nieuwe bestelling", "Bestelling aangemaakt in Shopify", ShoppingBag, "shopify"),
	trig("trigger.order_shipped", "Bestelling verzonden", "Bestelling als verzonden gemarkeerd", Truck, "shopify"),
	trig("trigger.shipping_delay", "Bestelling vertraagd", "Levering later dan verwacht", Clock),
	trig("trigger.refund_requested", "Terugbetaling aangevraagd", "Klant vraagt een terugbetaling", RefreshCcw),
	trig("trigger.customer_reply", "Antwoord van klant", "Antwoord in een open gesprek", MessageCircle),
	trig("trigger.email_received", "E-mail ontvangen", "Inkomende e-mail komt overeen", Inbox),
	trig("trigger.review_received", "Nieuwe review", "Review geplaatst in de winkel", Star),
	trig("trigger.chargeback", "Chargeback ontvangen", "Geschil geopend bij de bank", ShieldAlert),
	trig("trigger.inventory_low", "Lage voorraad", "SKU onder de drempel", Box),
	trig("trigger.schedule", "Op een vast moment", "Elke dag, week of maand", Calendar),
	trig("trigger.webhook", "Inkomende webhook", "Algemene webhook-ontvanger", Webhook),

	/* ── Insyte's own actions ───────────────────────────────────────────────────────────────── */
	act("action.send_email", "E-mail versturen", "Een klant of het team mailen", Mail, "Insyte", {
		scope: "customers.email",
		defaults: { to: "{{customer.email}}", subject: "We zijn ermee bezig", body: "Hoi {{customer.first_name}},\n\nWe zagen dat je bestelling…" },
		fields: MESSAGE,
	}),
	act("action.create_ticket", "Ticket aanmaken", "Een intern ticket openen", TicketIcon, "Insyte", {
		scope: "tickets.write",
		defaults: { queue: "intake", priority: "normal", title: "Opvolgen: {{order.number}}", assignee: "Maya Roy" },
		fields: [
			{ key: "title", label: "Titel", type: "text", required: true },
			{ key: "assignee", label: "Toewijzen aan", type: "text" },
			{
				key: "priority",
				label: "Prioriteit",
				type: "select",
				options: [
					{ value: "low", label: "Laag" },
					{ value: "normal", label: "Gemiddeld" },
					{ value: "high", label: "Hoog" },
				],
			},
			{
				key: "queue",
				label: "Wachtrij",
				type: "select",
				options: [
					{ value: "intake", label: "Nieuw" },
					{ value: "in_progress", label: "Bezig" },
					{ value: "disputes", label: "Geschillen" },
				],
			},
		],
	}),
	act("action.tag_customer", "Klant labelen", "Een label aan de klant toevoegen", Tag, "Insyte", {
		scope: "customers.write",
		defaults: { tag: "follow-up" },
		fields: [{ key: "tag", label: "Label", type: "text", required: true }],
	}),
	act("action.notify_supplier", "Leverancier berichten", "Bericht in het leverancierskanaal", Send, "Insyte", {
		scope: "suppliers.message",
		defaults: { supplier: "{{order.supplier}}", message: "Kun je de verzending bevestigen?" },
		fields: [
			{ key: "supplier", label: "Leverancier", type: "text", required: true },
			{ key: "message", label: "Bericht", type: "textarea" },
		],
	}),
	act("action.alert_team", "Team waarschuwen", "Escaleren naar een team of persoon", AlertTriangle, "Insyte", {
		scope: "team.notify",
		defaults: { team: "Elena Hart", urgency: "high" },
		fields: [
			{ key: "team", label: "Wie", type: "text", required: true },
			{
				key: "urgency",
				label: "Urgentie",
				type: "select",
				options: [
					{ value: "low", label: "Laag" },
					{ value: "medium", label: "Gemiddeld" },
					{ value: "high", label: "Hoog" },
				],
			},
		],
	}),
	act("action.require_approval", "Goedkeuring vragen", "Wachten tot een collega het voorstel goedkeurt", ClipboardCheck, "Insyte", {
		defaults: { approver: "Elena Hart" },
		fields: [{ key: "approver", label: "Goedkeuring door", type: "text", required: true }],
	}),
	act("action.refund", "Terugbetalen", "Gedeeltelijke of volledige terugbetaling", CreditCard, "Insyte", {
		scope: "refunds.write",
		defaults: { amount: "volledig", reason: "Coulance" },
		fields: [
			{ key: "amount", label: "Bedrag", type: "text", placeholder: "volledig of 25,00", required: true },
			{ key: "reason", label: "Reden", type: "text" },
		],
	}),
	act("action.assign_supplier", "Leverancier toewijzen", "Bestelling doorzetten naar een leverancier", UserPlus, "Insyte", {
		scope: "orders.write",
		defaults: { supplier: "Yiwu Trading" },
		fields: [{ key: "supplier", label: "Leverancier", type: "text", required: true }],
	}),
	act("action.update_tracking", "Track & trace bijwerken", "Trackingnummer op de bestelling zetten", Truck, "Insyte", { scope: "orders.write" }),
	act("action.split_fulfillment", "Afhandeling splitsen", "Splitsen in meerdere zendingen", Split, "Insyte", { scope: "orders.write" }),
	act("action.merge_orders", "Bestellingen samenvoegen", "Open bestellingen combineren", GitMerge, "Insyte", { scope: "orders.write" }),
	act("action.verify_address", "Adres controleren", "Het verzendadres nalopen", ShieldCheck, "Insyte", { scope: "orders.read" }),
	act("action.detect_fraud", "Fraude nagaan", "De frauderegels toepassen", AlertTriangle, "Insyte", { scope: "orders.read" }),
	act("action.sync_inventory", "Voorraad ophalen", "Actuele voorraad per SKU", RefreshCcw, "Insyte", { scope: "stock.read" }),
	act("action.check_eta", "Leverdatum herberekenen", "Verwachte leverdatum opnieuw bepalen", Clock, "Insyte", { scope: "orders.read" }),
	act("action.track_event", "Event vastleggen", "Vastleggen in analyse", BarChart3, "Insyte", {
		defaults: { event: "automation.fired" },
		fields: [{ key: "event", label: "Eventnaam", type: "text" }],
	}),
	act("action.add_to_cohort", "Aan groep toevoegen", "Klant groeperen voor analyse", UserSearch, "Insyte", { scope: "customers.write" }),
	act("action.run_workflow", "Andere flow starten", "Een andere automatisering uitvoeren", Zap, "Insyte", {
		defaults: { workflow_id: "" },
		fields: [{ key: "workflow_id", label: "Flow", type: "text" }],
	}),

	/* ── logic ──────────────────────────────────────────────────────────────────────────────── */
	{
		id: "condition.branch",
		kind: "branch",
		label: "Ja/nee-splitsing",
		description: "Twee wegen, afhankelijk van een voorwaarde",
		icon: Split,
		category: "Logica",
		defaultConfig: { expression: "{{order.total}} > 100" },
		fields: [{ key: "expression", label: "Voorwaarde", type: "text", placeholder: "{{order.total}} > 100", required: true }],
	},
	{
		id: "condition.filter",
		kind: "condition",
		label: "Filter",
		description: "Alleen doorgaan als de voorwaarde klopt",
		icon: Filter,
		category: "Logica",
		defaultConfig: { expression: "{{order.total}} > 100" },
		fields: [{ key: "expression", label: "Voorwaarde", type: "text", placeholder: "{{order.total}} > 100", required: true }],
	},
	{
		id: "condition.country",
		kind: "condition",
		label: "Land is gelijk aan",
		description: "Vergelijken op verzendland",
		icon: Route,
		category: "Logica",
		defaultConfig: { country: "Duitsland" },
		fields: [{ key: "country", label: "Land", type: "text", placeholder: "Duitsland", required: true }],
	},
	{
		id: "condition.tag_match",
		kind: "condition",
		label: "Label komt overeen",
		description: "Labels van klant of bestelling vergelijken",
		icon: Hash,
		category: "Logica",
		defaultConfig: { tag: "vip" },
		fields: [{ key: "tag", label: "Label", type: "text", placeholder: "vip", required: true }],
	},
	{
		id: "delay.wait",
		kind: "delay",
		label: "Wachten",
		description: "De flow een tijd pauzeren",
		icon: Clock,
		category: "Logica",
		defaultConfig: { minutes: 30 },
		fields: [{ key: "minutes", label: "Minuten", type: "number" }],
	},
	{
		id: "delay.wait_no_reply",
		kind: "delay",
		label: "Wachten op antwoord",
		description: "Pas verder als de klant niet antwoordt",
		icon: Clock,
		category: "Logica",
		defaultConfig: { hours: 24 },
		fields: [{ key: "hours", label: "Uren", type: "number" }],
	},

	/* ── AI ─────────────────────────────────────────────────────────────────────────────────── */
	act("action.ai_compose", "Antwoord opstellen", "Een persoonlijk antwoord in de stem van het merk", Sparkles, "AI", {
		ai: true,
		scope: "ai.draft",
		defaults: { tone: "warm", instructions: "Bied excuses aan en geef 10% korting op de volgende bestelling." },
		fields: [
			{
				key: "tone",
				label: "Toon",
				type: "select",
				options: [
					{ value: "warm", label: "Warm" },
					{ value: "professional", label: "Zakelijk" },
					{ value: "playful", label: "Speels" },
				],
			},
			{ key: "instructions", label: "Instructies", type: "textarea" },
		],
	}),
	act("action.ai_classify", "Sentiment en onderwerp lezen", "Labelen of doorsturen op wat de klant schrijft", Sparkles, "AI", { ai: true, scope: "ai.draft" }),
	act("action.ai_summarize", "Samenvatten", "Gesprek of bestelling samenvatten", Sparkles, "AI", { ai: true, scope: "ai.draft" }),
	act("action.ai_link_orders", "Bestellingen koppelen", "Verwante bestellingen van de klant groeperen", Link2, "AI", { ai: true, scope: "orders.read" }),
	act("action.ai_detect_intent", "Bedoeling herkennen", "Wat de klant wil, in één woord", Sparkles, "AI", { ai: true, scope: "ai.draft" }),
	act("action.ai_predict_ltv", "Klantwaarde voorspellen", "Wat de klant over de looptijd waard is", PiggyBank, "AI", { ai: true, scope: "customers.read" }),

	/* ── connected services ─────────────────────────────────────────────────────────────────── */
	act("action.shopify_update", "Bestelling bijwerken", "De bestelling in Shopify aanpassen", ShoppingBag, "Shopify", { brand: "shopify", scope: "orders.write" }),
	act("action.shopify_tag", "Label op bestelling", "Een label op de Shopify-bestelling zetten", Tag, "Shopify", {
		brand: "shopify",
		scope: "orders.write",
		defaults: { tag: "vertraagd" },
		fields: [{ key: "tag", label: "Label", type: "text", required: true }],
	}),
	act("action.shopify_fulfil", "Fulfilment aanmaken", "Een zending in Shopify aanmaken", Package, "Shopify", { brand: "shopify", scope: "orders.write" }),
	act("action.klaviyo_send", "E-mail via Klaviyo", "Versturen met een Klaviyo-sjabloon", Mail, "Klaviyo", {
		brand: "klaviyo",
		scope: "customers.email",
		defaults: { to: "{{customer.email}}", template: "Excuses + nieuwe leverdatum" },
		fields: [
			{ key: "to", label: "Aan", type: "text", required: true },
			{ key: "template", label: "Sjabloon", type: "text" },
		],
	}),
	act("action.klaviyo_list", "Aan lijst toevoegen", "Profiel op een Klaviyo-lijst zetten", UserPlus, "Klaviyo", { brand: "klaviyo", scope: "customers.write" }),
	act("action.klaviyo_pause", "Campagne pauzeren", "Een lopende Klaviyo-campagne stilzetten", Clock, "Klaviyo", { brand: "klaviyo", scope: "marketing.write" }),
	act("action.gmail_send", "Mail via Gmail", "Versturen vanuit de gekoppelde Gmail-mailbox", Mail, "Gmail", {
		brand: "gmail",
		scope: "customers.email",
		defaults: { to: "{{customer.email}}", subject: "Over je bestelling" },
		fields: MESSAGE,
	}),
	act("action.outlook_send", "Mail via Outlook", "Versturen vanuit de gekoppelde Outlook-mailbox", Mail, "Outlook", {
		brand: "outlook",
		scope: "customers.email",
		defaults: { to: "{{customer.email}}", subject: "Over je bestelling" },
		fields: MESSAGE,
	}),
	act("action.slack_notify", "Bericht in kanaal", "Een bericht in een Slack-kanaal plaatsen", MessageSquare, "Slack", {
		brand: "slack",
		scope: "team.notify",
		defaults: { channel: "#cx", text: "Let op: {{trigger.summary}}" },
		fields: CHANNEL,
	}),
	act("action.slack_dm", "Privébericht", "Een collega rechtstreeks berichten", Bell, "Slack", {
		brand: "slack",
		scope: "team.notify",
		defaults: { channel: "@elena", text: "{{trigger.summary}}" },
		fields: CHANNEL,
	}),
	act("action.teams_notify", "Bericht in Teams", "Een bericht in een Teams-kanaal plaatsen", MessageSquare, "Microsoft Teams", {
		brand: "microsoft-teams",
		scope: "team.notify",
		defaults: { channel: "Klantenservice", text: "{{trigger.summary}}" },
		fields: CHANNEL,
	}),
	act("action.gorgias_create", "Ticket in Gorgias", "Het ticket doorzetten naar Gorgias", TicketIcon, "Gorgias", { brand: "gorgias", scope: "tickets.write" }),
	act("action.stripe_refund", "Terugbetalen via Stripe", "De betaling in Stripe terugboeken", CreditCard, "Stripe", { brand: "stripe", scope: "refunds.write" }),
	act("action.stripe_lookup", "Betaling opzoeken", "De Stripe-betaling bij de bestelling ophalen", Receipt, "Stripe", { brand: "stripe", scope: "payments.read" }),
	act("action.klarna_refund", "Terugbetalen via Klarna", "De Klarna-betaling terugboeken", CreditCard, "Klarna", { brand: "klarna", scope: "refunds.write" }),
	act("action.klarna_dispute", "Geschil beantwoorden", "Het bewijs naar Klarna sturen", ShieldCheck, "Klarna", { brand: "klarna", scope: "disputes.write" }),
	act("action.paypal_refund", "Terugbetalen via PayPal", "De PayPal-betaling terugboeken", CreditCard, "PayPal", { brand: "paypal", scope: "refunds.write" }),
	act("action.dhl_track", "Zending volgen", "De status bij DHL ophalen", Truck, "DHL", { brand: "dhl", scope: "orders.read" }),
	act("action.dhl_return", "Retourlabel maken", "Een DHL-retourlabel voor de klant", Package, "DHL", { brand: "dhl", scope: "orders.write" }),
	act("action.postnl_track", "Zending volgen", "De status bij PostNL ophalen", Truck, "PostNL", { brand: "postnl", scope: "orders.read" }),
	act("action.postnl_return", "Retourlabel maken", "Een PostNL-retourlabel voor de klant", Package, "PostNL", { brand: "postnl", scope: "orders.write" }),
	act("action.sendcloud_label", "Verzendlabel maken", "Label en track & trace via Sendcloud", Package, "Sendcloud", { brand: "sendcloud", scope: "orders.write" }),
	act("action.exact_invoice", "Verkoopfactuur boeken", "De bestelling als factuur in Exact Online", Receipt, "Exact Online", { brand: "exact", scope: "accounting.write" }),
	act("action.exact_credit", "Creditnota boeken", "De terugbetaling als creditnota in Exact Online", Receipt, "Exact Online", { brand: "exact", scope: "accounting.write" }),
	act("action.m365_excel", "Rij in Excel", "Een regel toevoegen aan een Excel-werkmap", BarChart3, "Microsoft 365", { brand: "microsoft", scope: "files.write" }),
	act("action.m365_calendar", "Agenda-item", "Een afspraak in Outlook-agenda zetten", Calendar, "Microsoft 365", { brand: "microsoft", scope: "files.write" }),
	act("action.sheets_row", "Rij toevoegen", "Een regel toevoegen aan een Google-spreadsheet", BarChart3, "Google Sheets", { brand: "google-sheets", scope: "files.write" }),
];

export const VARIANTS_BY_ID: Record<string, NodeVariant> = Object.fromEntries(NODE_VARIANTS.map((v) => [v.id, v]));

export type PaletteGroup = { name: string; brand?: string; defaultOpen: boolean; variants: NodeVariant[] };

const GROUPS: ReadonlyArray<{ name: string; defaultOpen: boolean }> = [
	{ name: "Triggers", defaultOpen: true },
	{ name: "Insyte", defaultOpen: true },
	{ name: "Logica", defaultOpen: false },
	{ name: "AI", defaultOpen: false },
];

const BRAND_GROUPS = [...new Set(NODE_VARIANTS.filter((v) => v.brand && v.kind === "action").map((v) => v.category))];

export const PALETTE_GROUPS: PaletteGroup[] = [
	...GROUPS.map((g) => ({ ...g, variants: NODE_VARIANTS.filter((v) => v.category === g.name) })),
	...BRAND_GROUPS.map((name) => {
		const variants = NODE_VARIANTS.filter((v) => v.category === name);
		return { name, brand: variants[0]?.brand, defaultOpen: name === "Shopify" || name === "Klaviyo", variants };
	}),
];

/** The word on a step's header strip. */
export function kindLabel(v: NodeVariant): string {
	if (v.kind === "trigger") return "Trigger · als";
	if (v.kind === "branch") return "Splitsing";
	if (v.kind === "condition") return "Voorwaarde";
	if (v.kind === "delay") return "Wachten";
	if (v.ai) return "AI-stap";
	if (v.brand) return v.category;
	return "Insyte";
}

export type WorkflowNode = {
	id: string;
	variantId: string;
	config: Record<string, unknown>;
	/** A Ja/nee-splitsing's two lanes. They merge back into the main line after it. */
	branches?: { yes: WorkflowNode[]; no: WorkflowNode[] };
};

export type VersionEntry = {
	v: number;
	at: string;
	by: string;
	note: string;
	nodes: WorkflowNode[];
};

export type WorkflowSettings = {
	/** Rights a step needs that were switched off; the step fails without them. */
	scopesOff: string[];
	/** Rights granted that no step needs. */
	scopesExtra: string[];
	/** Who hears when a run fails. */
	notify: string;
	/** Runs per hour at most; 0 is no limit. */
	rateLimit: number;
};

export type WorkflowState = {
	automationId: string;
	name: string;
	description: string;
	status: "active" | "paused" | "draft";
	nodes: WorkflowNode[];
	savedAt: string;
	createdAt: string;
	owner: string;
	/** The published version; 0 until the first publication. */
	version: number;
	versions: VersionEntry[];
	settings: WorkflowSettings;
	/** Every run so far, including the ones before this session. */
	runs: number;
	/** The recent runs, newest first. */
	history: WorkflowRun[];
};

export type RunStatus = "succeeded" | "failed" | "waiting" | "duplicate";

export type RunStep = {
	nodeId: string;
	variantId: string;
	label: string;
	/** `pending` is a step a waiting run has not reached yet. */
	status: "ok" | "error" | "skipped" | "waiting" | "pending";
	ms: number;
	/** In a lane of a splitsing: which one. */
	lane?: "yes" | "no";
};

export type WorkflowRun = {
	id: string;
	at: string;
	status: RunStatus;
	steps: number;
	durationMs: number;
	/** What started it, in the trigger's words. */
	cause?: string;
	/** For a failed run: what went wrong, in plain words. */
	error?: string;
	/** For a failed run: what fixes it. */
	fix?: string;
	/** Started by hand rather than by its trigger. */
	manual?: boolean;
	/** The record that started it. */
	record?: { kind: "order" | "customer" | "ticket" | "chargeback" | "product"; id: string; number: string; name: string };
	version?: number;
	key?: string;
	timeline?: RunStep[];
	input?: Record<string, string>;
};

let _idSeq = 0;
export function newNodeId() {
	_idSeq += 1;
	return `n_${Date.now().toString(36)}_${_idSeq}`;
}

/** Every node of a flow, the lanes of a splitsing included, in the order a run meets them. */
export function flatNodes(nodes: ReadonlyArray<WorkflowNode>): WorkflowNode[] {
	return nodes.flatMap((n) => (n.branches ? [n, ...n.branches.yes, ...n.branches.no] : [n]));
}
