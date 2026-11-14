import { Keyboard, Mail, MessageSquareText, Palette, Receipt, ShieldCheck, Radio, GraduationCap, Sheet as SheetIcon, Clock as Recent, Bot, Send, Sparkle, Undo2, AlertOctagon, AlertTriangle, Archive, BadgePercent, Bell, Box, Building, ChartLine, CheckCircle2, Circle, Clock, CornerDownLeft, CreditCard, Database, Download, Edit3, FileText, Filter, Folder, Globe, Grid2x2, Home, Inbox, Key, Link2, List, Loader, MessagesSquare, Plug, RotateCcw, Shield, ShoppingBag, Slash, Sparkles, Star, Store, Ticket, Trash2, Truck, Upload, User, UserCog, UserPlus, Users, UserX, Wallet, Webhook, Workflow, XCircle, Zap } from "../../icons";
import type { Persona } from "./types/persona";
import type {
	RailItem,
	SidebarConfig,
	SubPanelConfig,
} from "./types/sub-panel";

export const ADMIN_RAIL: RailItem[] = [
	{ to: "/dashboard", label: "Dashboard", icon: Home },
	{ to: "/tickets", label: "Tickets", icon: Ticket, matchPrefix: "/tickets" },
	{ to: "/chats", label: "Chats", icon: MessagesSquare, matchPrefix: "/chats" },
	{ to: "/inbox", label: "Inbox", icon: Inbox, matchPrefix: "/inbox" },
	{ to: "/orders", label: "Bestellingen", icon: ShoppingBag, matchPrefix: "/orders" },
	{
		to: "/customers",
		label: "Klanten",
		icon: Users,
		matchPrefix: "/customers",
	},
	{ to: "/products", label: "Producten", icon: Box, matchPrefix: "/products" },
	{
		to: "/chargebacks",
		label: "Chargebacks",
		icon: CornerDownLeft,
		matchPrefix: "/chargebacks",
	},
	{
		to: "/automations",
		label: "Automatiseringen",
		icon: Workflow,
		matchPrefix: "/automations",
	},
];

export const SUPPLIER_RAIL: RailItem[] = [
	{ to: "/supplier/dashboard", label: "Dashboard", icon: Home },
	{ to: "/supplier/products", label: "Producten", icon: Box },
	{ to: "/supplier/orders", label: "Bestellingen", icon: ShoppingBag },
	{ to: "/supplier/chats", label: "Chats", icon: MessagesSquare },
	{ to: "/supplier/statements", label: "Afrekeningen", icon: Wallet },
	{ to: "/supplier/training", label: "Training", icon: GraduationCap },
	{ to: "/supplier/settings", label: "Instellingen", icon: Plug },
];

export const AFFILIATE_RAIL: RailItem[] = [
	{ to: "/affiliate/dashboard", label: "Dashboard", icon: Home },
	{ to: "/affiliate/referrals", label: "Doorverwijzingen", icon: Link2 },
	{ to: "/affiliate/payouts", label: "Uitbetalingen", icon: Wallet },
	{ to: "/affiliate/resources", label: "Materiaal", icon: FileText },
	{ to: "/affiliate/settings", label: "Instellingen", icon: Plug },
];

export const RAIL_BY_PERSONA: Record<Persona, RailItem[]> = {
	admin: ADMIN_RAIL,
	supplier: SUPPLIER_RAIL,
	affiliate: AFFILIATE_RAIL,
};

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar: single white column with MAIN / TOOLS / TEAM sections.
// Replaces the old dark icon rail (RAIL_BY_PERSONA).
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_SIDEBAR: SidebarConfig = {
	main: [
		{ to: "/dashboard", label: "Dashboard", icon: Home },
		{
			to: "/orders",
			label: "Bestellingen",
			icon: ShoppingBag,
			matchPrefix: "/orders",
		},
		{ to: "/returns", label: "Retouren", icon: RotateCcw, matchPrefix: "/returns" },
		{
			to: "/customers",
			label: "Klanten",
			icon: Users,
			matchPrefix: "/customers",
		},
		{ to: "/products", label: "Producten", icon: Box, matchPrefix: "/products" },
		{ to: "/inbox", label: "Inbox", icon: Inbox, matchPrefix: "/inbox" },
		{
			to: "/tickets",
			label: "Tickets",
			icon: Ticket,
			matchPrefix: "/tickets",
		},
		{
			to: "/chargebacks",
			label: "Chargebacks",
			icon: CornerDownLeft,
			matchPrefix: "/chargebacks",
		},
		{ to: "/chats", label: "Chats", icon: MessagesSquare, matchPrefix: "/chats" },
	],
	tools: [
		{ to: "/ask", label: "Vraag Insyte", icon: Sparkles, matchPrefix: "/ask" },
		{ to: "/analytics", label: "Analyse", icon: ChartLine },
		{
			to: "/automations",
			label: "Automatiseringen",
			icon: Workflow,
			matchPrefix: "/automations",
		},
		{ to: "/sheets", label: "Rekenbladen", icon: SheetIcon, matchPrefix: "/sheets" },
		{ to: "/courses", label: "Cursussen", icon: GraduationCap, matchPrefix: "/courses" },
		{ to: "/data", label: "Data", icon: Database, matchPrefix: "/data" },
		{ to: "/affiliates", label: "Affiliates", icon: BadgePercent, matchPrefix: "/affiliates" },
	],
	team: [
		{ name: "Ethan Jones", tone: "pink" },
		{ name: "Sofia Kim", tone: "rose" },
		{ name: "Liam Tanaka", tone: "peach" },
		{ name: "Maya Rossi", tone: "amber" },
	],
};

const SUPPLIER_SIDEBAR: SidebarConfig = {
	main: [
		{ to: "/supplier/dashboard", label: "Dashboard", icon: Home },
		{ to: "/supplier/products", label: "Producten", icon: Box },
		{ to: "/supplier/orders", label: "Bestellingen", icon: ShoppingBag },
		{ to: "/supplier/chats", label: "Chats", icon: MessagesSquare },
		{ to: "/supplier/statements", label: "Afrekeningen", icon: Wallet, matchPrefix: "/supplier/statements" },
		{ to: "/supplier/training", label: "Training", icon: GraduationCap, matchPrefix: "/supplier/training" },
	],
	tools: [{ to: "/supplier/settings", label: "Instellingen", icon: Plug, matchPrefix: "/supplier/settings" }],
	team: [
		{ name: "Marco Rossi", tone: "peach" },
		{ name: "Priya Patel", tone: "rose" },
	],
};

const AFFILIATE_SIDEBAR: SidebarConfig = {
	main: [
		{ to: "/affiliate/dashboard", label: "Dashboard", icon: Home },
		{ to: "/affiliate/referrals", label: "Doorverwijzingen", icon: Link2 },
		{ to: "/affiliate/payouts", label: "Uitbetalingen", icon: Wallet },
		{ to: "/affiliate/resources", label: "Materiaal", icon: FileText },
	],
	tools: [{ to: "/affiliate/settings", label: "Instellingen", icon: Plug }],
	team: [],
};

export const SIDEBAR_BY_PERSONA: Record<Persona, SidebarConfig> = {
	admin: ADMIN_SIDEBAR,
	supplier: SUPPLIER_SIDEBAR,
	affiliate: AFFILIATE_SIDEBAR,
};

/*
 * Counts the panel can actually stand behind.
 *
 * Most of the numbers below are still written by hand, because most of them answer a question no
 * screen asks in the same words — the orders panel cuts by Open / Processing / Shipped, the orders
 * page by Awaiting fulfillment / Delayed. Three of them did collide: the panel said "Active 5" with
 * the automations screen reading "8 flows are running right now" an inch to its right, and the inbox
 * panel counted five Unassigned beside a list of ten. A navigation that disagrees with the thing it
 * is navigating is worse than one that says nothing, so these three read the same source the screens
 * read.
 */


/*
 * Tickets are work, not mail, so their panel speaks in views — who has it, whether it is waiting —
 * rather than in mailbox folders. Where a ticket came from is its own section, built live in the
 * sub-panel from the connected services (`withTickets`), with each provider's logo and a real count.
 */
const TICKETS_PANEL: SubPanelConfig = {
	title: "Tickets",
	icon: Ticket,
	cta: { label: "Nieuw ticket", to: "/tickets", create: "ticket" },
	sections: [
		{
			label: "Tickets",
			items: [
				{ to: "/tickets", label: "Alle tickets", icon: List, exact: true },
				{ to: "/tickets", label: "Aan mij toegewezen", icon: User, search: { view: "mine" } },
				{ to: "/tickets", label: "Niet toegewezen", icon: UserX, search: { view: "unassigned" } },
				{ to: "/tickets", label: "Uitgesteld", icon: Clock, search: { view: "snoozed" } },
			],
		},
		{
			label: "Gesloten",
			items: [
				{ to: "/tickets", label: "Klaar", icon: CheckCircle2, search: { view: "done" } },
				{ to: "/tickets", label: "Gearchiveerd", icon: Archive, search: { view: "archived" } },
				{ to: "/tickets", label: "Spam", icon: AlertOctagon, search: { view: "spam" } },
				{ to: "/tickets", label: "Prullenbak", icon: Trash2, search: { view: "trash" } },
			],
		},
	],
};

const INBOX_PANEL: SubPanelConfig = {
	title: "Inbox",
	icon: Inbox,
	cta: { label: "Nieuwe e-mail", to: "/inbox", create: "thread" },
	sections: [
		{
			label: "Inbox",
			items: [
				{
					to: "/inbox",
					label: "Alle berichten",
					icon: Inbox,
					exact: true,
				},
				{
					to: "/inbox",
					label: "Niet toegewezen",
					icon: UserX,
					search: { folder: "unassigned" },
				},
				{
					to: "/inbox",
					label: "Aan mij toegewezen",
					icon: User,
					search: { folder: "mine" },
				},
				{
					to: "/inbox",
					label: "Gekoppeld aan ticket",
					icon: Ticket,
					search: { folder: "linked" },
				},
			],
		},
		{
			label: "Insyte",
			items: [
				{ to: "/inbox", label: "Overgedragen", icon: UserPlus, search: { view: "handed_over" } },
				{ to: "/inbox", label: "Door Insyte afgehandeld", icon: Sparkle, search: { view: "insyte" } },
			],
		},
		{
			label: "Overig",
			items: [
				{
					to: "/inbox",
					label: "Archief",
					icon: Archive,
					search: { folder: "archive" },
				},
				{
					to: "/inbox",
					label: "Prullenbak",
					icon: Trash2,
					search: { folder: "trash" },
				},
				{
					to: "/inbox",
					label: "Spam",
					icon: AlertOctagon,
					search: { folder: "spam" },
				},
			],
		},
	],
};

/* The supplier's orders, cut by what it has to do next. Counts are filled live by the panel. */
const SUPPLIER_ORDERS_PANEL: SubPanelConfig = {
	title: "Bestellingen",
	icon: ShoppingBag,
	sections: [
		{
			label: "Te doen",
			items: [
				{ to: "/supplier/orders", label: "Te accepteren", icon: Inbox, search: { view: "to_accept" } },
				{ to: "/supplier/orders", label: "Te verzenden", icon: Truck, exact: true },
				{ to: "/supplier/orders", label: "Te laat", icon: Clock, search: { view: "late" } },
				{ to: "/supplier/orders", label: "Probleem gemeld", icon: AlertTriangle, search: { view: "problem" } },
			],
		},
		{
			label: "Afgerond",
			items: [
				{ to: "/supplier/orders", label: "Verzonden", icon: CheckCircle2, search: { view: "shipped" } },
				{ to: "/supplier/orders", label: "Alle bestellingen", icon: List, search: { view: "all" } },
			],
		},
	],
};

const SUPPLIER_PRODUCTS_PANEL: SubPanelConfig = {
	title: "Producten",
	icon: Box,
	sections: [
		{
			label: "Voorraad",
			items: [
				{ to: "/supplier/products", label: "Alle producten", icon: Box, exact: true },
				{ to: "/supplier/products", label: "Lage voorraad", icon: AlertTriangle, search: { view: "low" } },
				{ to: "/supplier/products", label: "Uitverkocht", icon: XCircle, search: { view: "out" } },
			],
		},
	],
};

const SUPPLIER_SETTINGS_PANEL: SubPanelConfig = {
	title: "Instellingen",
	icon: Plug,
	sections: [
		{
			label: "Allure Fulfillment",
			items: [
				{ to: "/supplier/settings/profile", label: "Bedrijfsprofiel", icon: Building },
				{ to: "/supplier/settings/api-connection", label: "API-koppeling", icon: Plug },
				{ to: "/supplier/settings/notifications", label: "Meldingen", icon: Bell },
			],
		},
	],
};

const CHATS_PANEL: SubPanelConfig = {
	title: "Chats",
	icon: MessagesSquare,
	cta: { label: "Nieuw kanaal", to: "/chats", create: "channel" },
	sections: [
		{
			label: "Kanalen",
			items: [
				{
					to: "/chats",
					label: "# customer-service",
					icon: MessagesSquare,
					count: 4,
					search: { id: "conv_customer_service" },
				},
				{
					to: "/chats",
					label: "# fulfillment",
					icon: MessagesSquare,
					search: { id: "conv_fulfillment" },
				},
				{
					to: "/chats",
					label: "# operations",
					icon: MessagesSquare,
					count: 2,
					search: { id: "conv_team_ops" },
				},
				{
					to: "/chats",
					label: "# allure-fulfillment",
					icon: MessagesSquare,
					search: { id: "conv_supplier_allure" },
				},
				{
					to: "/chats",
					label: "# dpc-apparel",
					icon: MessagesSquare,
					count: 1,
					search: { id: "conv_supplier_dpc" },
				},
			],
		},
		{
			label: "Privéberichten",
			items: [
				{
					to: "/chats",
					label: "Maya R.",
					icon: User,
					search: { id: "conv_dm_maya" },
				},
				{
					to: "/chats",
					label: "Marco Rossi",
					icon: User,
					search: { id: "conv_dm_marco" },
				},
			],
		},
	],
};

const ORDERS_PANEL: SubPanelConfig = {
	title: "Bestellingen",
	icon: ShoppingBag,
	cta: { label: "Nieuwe bestelling", to: "/orders", create: "order" },
	sections: [
		{
			label: "Status",
			items: [
				{ to: "/orders", label: "Alle bestellingen", icon: List, exact: true },
				{
					to: "/orders",
					label: "Open",
					icon: Circle,
					count: 8,
					search: { status: "open" },
				},
				{
					to: "/orders",
					label: "In behandeling",
					icon: Loader,
					count: 14,
					search: { status: "processing" },
				},
				{
					to: "/orders",
					label: "Verzonden",
					icon: Truck,
					count: 12,
					search: { status: "shipped" },
				},
			],
		},
		{
			label: "Doorsturen",
			items: [
				{ to: "/orders", label: "Te versturen", icon: Send, search: { view: "to_forward" } },
				{ to: "/orders", label: "Wacht op bevestiging", icon: Clock, search: { view: "awaiting" } },
				{ to: "/orders", label: "Uitverkocht of fout", icon: AlertTriangle, search: { view: "forward_error" } },
			],
		},
		{
			label: "Problemen",
			items: [
				{ to: "/returns", label: "Retouren", icon: RotateCcw },
				{
					to: "/orders",
					label: "Geannuleerd",
					icon: XCircle,
					search: { status: "cancelled" },
				},
			],
		},
	],
};

const CUSTOMERS_PANEL: SubPanelConfig = {
	title: "Klanten",
	icon: Users,
	cta: { label: "Klant toevoegen", to: "/customers", create: "customer" },
	sections: [
		{
			label: "Segmenten",
			items: [
				{ to: "/customers", label: "Alle klanten", icon: Users, exact: true },
				{
					to: "/customers",
					label: "Nieuw",
					icon: UserPlus,
					count: 6,
					search: { segment: "new" },
				},
				{
					to: "/customers",
					label: "VIP",
					icon: Star,
					count: 24,
					search: { segment: "vip" },
				},
				{
					to: "/customers",
					label: "Risico",
					icon: AlertTriangle,
					count: 3,
					search: { segment: "at_risk" },
				},
			],
		},
		{
			label: "Beheer",
			items: [
				{
					to: "/customers",
					label: "Geblokkeerd",
					icon: Slash,
					search: { segment: "blocked" },
				},
				{
					to: "/customers",
					label: "Segmentatie",
					icon: Filter,
					search: { view: "segments" },
				},
			],
		},
	],
};

const PRODUCTS_PANEL: SubPanelConfig = {
	title: "Producten",
	icon: Box,
	cta: { label: "Product toevoegen", to: "/products", create: "product" },
	sections: [
		{
			label: "Catalogus",
			items: [
				{ to: "/products", label: "Alle producten", icon: Grid2x2, exact: true },
				{
					to: "/products",
					label: "Actief",
					icon: CheckCircle2,
					search: { status: "active" },
				},
				{
					to: "/products",
					label: "Concept",
					icon: Edit3,
					search: { status: "draft" },
				},
				{
					to: "/products",
					label: "Gearchiveerd",
					icon: Archive,
					search: { status: "archived" },
				},
			],
		},
		{
			label: "Aandacht",
			items: [
				{ to: "/products", label: "Retour boven 10%", icon: RotateCcw, search: { status: "attention_returns" } },
				{ to: "/products", label: "Open klachten", icon: AlertTriangle, search: { status: "attention_complaints" } },
				{ to: "/products", label: "Controle loopt", icon: Clock, search: { status: "attention_checks" } },
			],
		},
		{
			label: "Organisatie",
			items: [
				{
					to: "/products",
					label: "Categorieën",
					icon: Folder,
					search: { view: "categories" },
				},
				{
					to: "/suppliers",
					label: "Leveranciers",
					icon: Truck,
				},
			],
		},
	],
};

const DATA_PANEL: SubPanelConfig = {
	title: "Data",
	icon: Database,
	sections: [
		{
			label: "Beheren",
			items: [
				{ to: "/data", label: "Overzicht", icon: Database, exact: true },
				{
					to: "/data",
					label: "Werkblad",
					icon: Grid2x2,
					search: { view: "sheet" },
				},
				{
					to: "/data",
					label: "Importeren",
					icon: Upload,
					search: { view: "import" },
				},
				{
					to: "/data",
					label: "Exporteren",
					icon: Download,
					search: { view: "export" },
				},
			],
		},
		{
			label: "Verbindingen",
			items: [
				{
					to: "/data",
					label: "Koppelingen",
					icon: Link2,
					count: 4,
					search: { view: "integrations" },
				},
				{
					to: "/data",
					label: "Synchronisatie",
					icon: Loader,
					search: { view: "sync" },
				},
				{
					to: "/data",
					label: "Webhooks",
					icon: Zap,
					search: { view: "webhooks" },
				},
			],
		},
	],
};

const AUTOMATIONS_PANEL: SubPanelConfig = {
	title: "Automatiseringen",
	icon: Workflow,
	cta: { label: "Nieuwe automatisering", to: "/automations", create: "automation" },
	sections: [
		{
			label: "Workflows",
			items: [
				{
					to: "/automations",
					label: "Alle workflows",
					icon: Zap,
					exact: true,
				},
				{
					to: "/automations",
					label: "Concepten",
					icon: Edit3,
					search: { view: "drafts" },
				},
				{
					to: "/automations",
					label: "Met AI-stappen",
					icon: Sparkles,
					search: { view: "ai" },
				},
				{
					to: "/automations",
					label: "Aanbevolen",
					icon: Star,
					search: { view: "recommended" },
				},
				{
					to: "/automations",
					label: "Geschiedenis",
					icon: Clock,
					search: { view: "history" },
				},
			],
		},
	],
};

const CHARGEBACKS_PANEL: SubPanelConfig = {
	title: "Chargebacks",
	icon: CornerDownLeft,
	cta: { label: "Nieuw bewijspakket", to: "/chargebacks", create: "evidence" },
	sections: [
		{
			label: "Status",
			items: [
				{ to: "/chargebacks", label: "Alle", icon: List, exact: true },
				{
					to: "/chargebacks",
					label: "Actie vereist",
					icon: AlertTriangle,
					count: 2,
					search: { tab: "action_required" },
				},
				{
					to: "/chargebacks",
					label: "Ingediend",
					icon: Upload,
					count: 3,
					search: { tab: "submitted" },
				},
				{
					to: "/chargebacks",
					label: "Gewonnen",
					icon: CheckCircle2,
					count: 2,
					search: { tab: "won" },
				},
				{
					to: "/chargebacks",
					label: "Verloren",
					icon: XCircle,
					count: 1,
					search: { tab: "lost" },
				},
			],
		},
	],
};

/* The partner programme from the brand's side: its people, who applied, and the month to approve. */
const AFFILIATES_PANEL: SubPanelConfig = {
	title: "Affiliates",
	icon: BadgePercent,
	sections: [
		{
			label: "Programma",
			items: [
				{ to: "/affiliates", label: "Affiliates", icon: Users, exact: true },
				{ to: "/affiliates", label: "Aanmeldingen", icon: Inbox, search: { view: "aanmeldingen" } },
				{ to: "/affiliates", label: "Uitbetalingen", icon: Wallet, search: { view: "uitbetalingen" } },
				{ to: "/affiliates", label: "Uitnodigingen", icon: UserPlus, search: { view: "uitnodigingen" } },
			],
		},
	],
};

const SETTINGS_PANEL: SubPanelConfig = {
	title: "Instellingen",
	icon: Plug,
	sections: [
		{
			label: "Algemeen",
			items: [
				{ to: "/settings/profile", label: "Account", icon: User },
				{ to: "/settings/team", label: "Team", icon: Users },
				{ to: "/settings/roles", label: "Rollen", icon: UserCog },
				{ to: "/settings/stores", label: "Winkels", icon: Store },
				{ to: "/settings/billing", label: "Facturatie", icon: CreditCard },
				{ to: "/settings/regional", label: "Regio", icon: Globe },
				{ to: "/settings/returns", label: "Retouren", icon: RotateCcw },
				{ to: "/settings/shipping", label: "Verzending", icon: Truck },
				{ to: "/settings/templates", label: "Sjablonen", icon: MessageSquareText },
				{ to: "/settings/brand", label: "Huisstijl", icon: Palette },
				{ to: "/settings/vat", label: "Btw", icon: Receipt },
				{ to: "/settings/notifications", label: "Meldingen", icon: Bell },
				{ to: "/settings/shortcuts", label: "Sneltoetsen", icon: Keyboard },
			],
		},
		{
			label: "Insyte AI",
			items: [
				{ to: "/settings/ai/autonomy", label: "Zelfstandigheid", icon: Sparkles },
				{ to: "/settings/ai/customer-agent", label: "Klantagent", icon: MessagesSquare },
				{ to: "/settings/ai/knowledge", label: "Kennisbank", icon: FileText },
				{ to: "/settings/ai/limits", label: "Limieten", icon: Wallet },
			],
		},
		{
			label: "Technisch",
			items: [
				{ to: "/settings/integrations", label: "Koppelingen", icon: Plug },
				{ to: "/settings/apps", label: "Apps", icon: BadgePercent },
				{ to: "/settings/security", label: "Beveiliging", icon: Shield },
				{ to: "/settings/api-keys", label: "API-sleutels", icon: Key },
				{ to: "/settings/webhooks", label: "Webhooks", icon: Webhook },
				{ to: "/settings/email-domain", label: "E-mail en domein", icon: Mail },
				{ to: "/settings/agents", label: "Agents en MCP", icon: Bot },
			],
		},
		{
			label: "Beheer",
			items: [
				{ to: "/settings/data", label: "Je gegevens", icon: Database },
				{ to: "/settings/privacy", label: "Gegevens en privacy", icon: ShieldCheck },
				{ to: "/settings/log", label: "Logboek", icon: FileText },
				{ to: "/settings/trash", label: "Prullenbak", icon: Trash2 },
			],
		},
	],
};

/*
 * The day's panel.
 *
 * It used to be a 439-line custom render: five dashboard "views" to switch between, a refresh
 * interval, and controls for editing a widget wall. All of that existed to configure the KPI-strip-
 * over-masonry dashboard, which this screen no longer is, so the panel is a panel again — the three
 * cuts of the queue, and the places the day's work actually goes when you leave it.
 */
const DASHBOARD_PANEL: SubPanelConfig = {
	title: "Vandaag",
	icon: Home,
	sections: [
		{
			label: "De dag",
			items: [
				{
					to: "/dashboard",
					label: "Wacht op jou",
					icon: Home,
					exact: true,
					liveCount: "needs-you"
				},
				{
					to: "/chargebacks",
					label: "Voorstellen klaar",
					icon: CornerDownLeft,
					liveCount: "drawn"
				},
				{ to: "/live", label: "Live", icon: Radio },
			],
		},
		{
			label: "Waar het heen gaat",
			items: [
				{ to: "/orders", label: "Bestellingen", icon: ShoppingBag },
				{ to: "/tickets", label: "Tickets", icon: Ticket },
				{ to: "/chargebacks", label: "Chargebacks", icon: CornerDownLeft },
				{ to: "/automations", label: "Automatiseringen", icon: Workflow },
			],
		},
	],
};

/*
 * Notifications, the way ClickUp's inbox is laid out: Primair (what asks something of you), Overig,
 * Later and Gewist, then the sources, each counted live in the sub-panel (`withNotifications`), which
 * also points these rows at the persona's own page.
 */
const NOTIFICATIONS_PANEL: SubPanelConfig = {
	title: "Meldingen",
	icon: Bell,
	sections: [
		{
			label: "Meldingen",
			items: [
				{ to: "/notifications", label: "Primair", icon: Inbox, exact: true },
				{ to: "/notifications", label: "Overig", icon: List, search: { view: "other" } },
				{ to: "/notifications", label: "Later", icon: Clock, search: { view: "later" } },
				{ to: "/notifications", label: "Gewist", icon: CheckCircle2, search: { view: "cleared" } },
			],
		},
	],
};

/*
 * Vraag Insyte's own area, for the log page: the conversations (the page that has its own rail) and
 * what Insyte did, cut by what can still be taken back. Counted live from the log (`withAgentLog`).
 */
const ASK_PANEL: SubPanelConfig = {
	title: "Vraag Insyte",
	icon: Sparkles,
	sections: [
		{
			label: "Vraag Insyte",
			items: [
				{ to: "/ask", label: "Gesprekken", icon: MessagesSquare, exact: true },
				{ to: "/ask/activity", label: "Wat Insyte deed", icon: Sparkle, exact: true },
			],
		},
		{
			label: "Activiteit",
			items: [
				{ to: "/ask/activity", label: "Kan nog terug", icon: RotateCcw, search: { view: "undoable" } },
				{ to: "/ask/activity", label: "Zelf gedaan", icon: Zap, search: { view: "auto" } },
				{ to: "/ask/activity", label: "Ongedaan gemaakt", icon: Undo2, search: { view: "undone" } },
				{ to: "/ask/activity", label: "Mislukt", icon: AlertTriangle, search: { view: "failed" } },
			],
		},
		{
			label: "Regels",
			items: [
				{ to: "/settings/ai/autonomy", label: "Zelfstandigheid", icon: Shield },
				{ to: "/settings/ai/limits", label: "Limieten", icon: Wallet },
			],
		},
	],
};

/*
 * Retouren: what is waiting on the team, what is done, returns against claims, and the portal the
 * shopper sees. Counted live from the queue (`withReturns`).
 */
const RETURNS_PANEL: SubPanelConfig = {
	title: "Retouren",
	icon: RotateCcw,
	cta: { label: "Retour starten", to: "/returns", create: "return" },
	sections: [
		{
			label: "Te doen",
			items: [
				{ to: "/returns", label: "Alle retouren", icon: List, exact: true },
				{ to: "/returns", label: "Te beoordelen", icon: Inbox, search: { view: "review" } },
				{ to: "/returns", label: "Wacht op pakket", icon: Truck, search: { view: "awaiting" } },
				{ to: "/returns", label: "Ontvangen", icon: Download, search: { view: "received" } },
				{ to: "/returns", label: "Klaar om af te handelen", icon: CheckCircle2, search: { view: "ready" } },
			],
		},
		{
			label: "Afgerond",
			items: [
				{ to: "/returns", label: "Afgehandeld", icon: Archive, search: { view: "resolved" } },
				{ to: "/returns", label: "Afgewezen", icon: XCircle, search: { view: "rejected" } },
			],
		},
		{
			label: "Soort",
			items: [
				{ to: "/returns", label: "Retouren", icon: RotateCcw, search: { view: "returns" } },
				{ to: "/returns", label: "Claims", icon: AlertTriangle, search: { view: "claims" } },
			],
		},
		{
			label: "Portaal",
			items: [{ to: "/settings/returns", label: "Retourinstellingen", icon: Shield }],
		},
	],
};

/* Cursussen (PLAN 39): the catalogue and its cuts, your own seat, and the team's side. Counted live (`withCourses`). */
const COURSES_PANEL: SubPanelConfig = {
	title: "Cursussen",
	icon: GraduationCap,
	cta: { label: "Nieuwe cursus", to: "/courses", create: "course" },
	sections: [
		{
			label: "Cursussen",
			items: [
				{ to: "/courses", label: "Alle cursussen", icon: List, exact: true },
				{ to: "/courses", label: "Mijn cursussen", icon: User, search: { view: "mine" } },
				{ to: "/courses", label: "Concepten", icon: Edit3, search: { view: "drafts" } },
				{ to: "/courses", label: "Archief", icon: Archive, search: { view: "archived" } },
			],
		},
		{
			label: "Team",
			items: [
				{ to: "/courses", label: "Voortgang", icon: Users, search: { view: "team" } },
				{ to: "/courses", label: "Vragen", icon: MessagesSquare, search: { view: "questions" } },
			],
		},
	],
};

/* Rekenbladen (PLAN 40): the list's cuts, then the folders, added live by the panel (`withSheets`). */
const SHEETS_PANEL: SubPanelConfig = {
	title: "Rekenbladen",
	icon: SheetIcon,
	cta: { label: "Nieuw rekenblad", to: "/sheets", create: "sheet" },
	sections: [
		{
			label: "Rekenbladen",
			items: [
				{ to: "/sheets", label: "Alle rekenbladen", icon: List, exact: true },
				{ to: "/sheets", label: "Vastgezet", icon: Star, search: { view: "pinned" } },
				{ to: "/sheets", label: "Recent", icon: Recent, search: { view: "recent" } },
				{ to: "/sheets", label: "Gedeeld met mij", icon: Users, search: { view: "shared" } },
				{ to: "/sheets", label: "Archief", icon: Archive, search: { view: "archive" } },
			],
		},
		{ label: "Mappen", items: [] },
		{ label: "Cijfers", items: [{ to: "/costs", label: "Kosten", icon: Wallet }] },
	],
};

export const SUB_PANELS: Record<string, SubPanelConfig | null> = {
	"/returns": RETURNS_PANEL,
	"/courses": COURSES_PANEL,
	"/sheets": SHEETS_PANEL,
	"/ask/activity": ASK_PANEL,
	"/dashboard": DASHBOARD_PANEL,
	"/live": DASHBOARD_PANEL,
	"/tickets": TICKETS_PANEL,
	"/chats": CHATS_PANEL,
	"/inbox": INBOX_PANEL,
	"/orders": ORDERS_PANEL,
	"/customers": CUSTOMERS_PANEL,
	"/products": PRODUCTS_PANEL,
	"/suppliers": PRODUCTS_PANEL,
	"/data": DATA_PANEL,
	"/affiliates": AFFILIATES_PANEL,
	"/supplier/orders": SUPPLIER_ORDERS_PANEL,
	"/supplier/products": SUPPLIER_PRODUCTS_PANEL,
	"/supplier/settings": SUPPLIER_SETTINGS_PANEL,
	"/automations": AUTOMATIONS_PANEL,
	"/chargebacks": CHARGEBACKS_PANEL,
	"/analytics": null,
	"/costs": null,
	"/marketplace": null,
	"/settings": SETTINGS_PANEL,
	"/notifications": NOTIFICATIONS_PANEL,
	"/supplier/notifications": NOTIFICATIONS_PANEL,
	"/affiliate/notifications": NOTIFICATIONS_PANEL,
};

/**
 * The dark icon rail shows every Workspace + Tools item as a single column.
 * Returns the merged list from {@link SIDEBAR_BY_PERSONA}.
 */
export function railItemsForPersona(persona: Persona) {
	const cfg = SIDEBAR_BY_PERSONA[persona];
	return [...cfg.main, ...cfg.tools];
}

export function panelForPath(pathname: string): SubPanelConfig | null {
	// Find longest matching prefix
	let best: { key: string; cfg: SubPanelConfig | null } | null = null;
	for (const [key, cfg] of Object.entries(SUB_PANELS)) {
		if (pathname === key || pathname.startsWith(`${key}/`)) {
			if (!best || key.length > best.key.length) best = { key, cfg };
		}
	}
	return best ? best.cfg : null;
}
