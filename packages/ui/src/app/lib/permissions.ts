import {
	BadgePercent,
	Box,
	ChartLine,
	CornerDownLeft,
	CreditCard,
	Database,
	RotateCcw,
	type IconComponent,
	MessagesSquare,
	Plug,
	Settings,
	ShoppingBag,
	Truck,
	Users,
	UserCog,
	Workflow,
} from "../../icons";

/*
 * What a person in the workspace may see and do, as one catalogue the roles page, the gates around
 * the console, the invite dialog and API keys all read.
 *
 * A permission is an AREA held at a LEVEL — Geen, Bekijken, Bewerken, Beheren — plus a handful of
 * SPECIAL ACTIONS that are worth naming on their own because money or trust leaves the building
 * when they are used: refunding, submitting chargeback evidence, exporting, merging customers,
 * publishing a flow, reading invoices. A role also says which STORES it reaches.
 *
 * The ids line up with the rights an automation's service account holds (`components/automations/
 * scopes.ts`) wherever the two speak about the same thing: `orders.read` is "Bestellingen ·
 * Bekijken", `orders.write` is "Bestellingen · Bewerken", `refunds.write` is the refund action and
 * `disputes.write` the chargeback one. An API key with custom scopes is written in the same ids.
 */

export type Level = 0 | 1 | 2 | 3;
export const LEVELS: ReadonlyArray<{ level: Level; label: string; short: string }> = [
	{ level: 0, label: "Geen", short: "Geen" },
	{ level: 1, label: "Bekijken", short: "Bekijken" },
	{ level: 2, label: "Bewerken", short: "Bewerken" },
	{ level: 3, label: "Beheren", short: "Beheren" },
];
export const levelLabel = (l: Level) => LEVELS[l]!.label;

export type AreaId =
	| "orders"
	| "returns"
	| "customers"
	| "products"
	| "support"
	| "chargebacks"
	| "suppliers"
	| "affiliates"
	| "automations"
	| "analytics"
	| "data"
	| "settings"
	| "team"
	| "billing"
	| "integrations";

export type Area = {
	id: AreaId;
	label: string;
	icon: IconComponent;
	/** The levels that mean something here. Analyse is read or nothing; Facturatie has no "edit". */
	levels: ReadonlyArray<Level>;
	/** What each level lets someone do, as the clause after "kan". Index by level. */
	can: Partial<Record<Level, string>>;
	/** Whether an API key can be given this area (team and billing are people-only). */
	api: boolean;
};

export const AREAS: ReadonlyArray<Area> = [
	{
		id: "orders",
		label: "Bestellingen",
		icon: ShoppingBag,
		levels: [0, 1, 2, 3],
		can: { 1: "bestellingen bekijken", 2: "bestellingen bewerken, labelen en annuleren", 3: "bestellingen beheren, ook verwijderen en voor anderen aanmaken" },
		api: true,
	},
	{
		id: "returns",
		label: "Retouren",
		icon: RotateCcw,
		levels: [0, 1, 2, 3],
		can: { 1: "retouren en claims zien", 2: "retouren behandelen, labels versturen en ontvangst melden", 3: "retouren beheren, ook termijnen, regels en het retourportaal" },
		api: true,
	},
	{
		id: "customers",
		label: "Klanten",
		icon: Users,
		levels: [0, 1, 2, 3],
		can: { 1: "klantprofielen bekijken", 2: "klanten bewerken en labelen", 3: "klanten beheren, ook blokkeren en verwijderen" },
		api: true,
	},
	{
		id: "products",
		label: "Producten",
		icon: Box,
		levels: [0, 1, 2, 3],
		can: { 1: "de catalogus bekijken", 2: "producten, prijzen en voorraad bewerken", 3: "producten beheren, ook archiveren en verwijderen" },
		api: true,
	},
	{
		id: "support",
		label: "Klantenservice",
		icon: MessagesSquare,
		levels: [0, 1, 2, 3],
		can: { 1: "tickets, inbox en chats lezen", 2: "tickets beantwoorden, toewijzen en sluiten", 3: "klantenservice beheren, ook mailboxen en verwijderen" },
		api: true,
	},
	{
		id: "chargebacks",
		label: "Chargebacks",
		icon: CornerDownLeft,
		levels: [0, 1, 2, 3],
		can: { 1: "geschillen en hun deadlines zien", 2: "bewijspakketten opstellen", 3: "chargebacks beheren, ook accepteren of laten vallen" },
		api: true,
	},
	{
		id: "suppliers",
		label: "Leveranciers",
		icon: Truck,
		levels: [0, 1, 2, 3],
		can: { 1: "leveranciers en hun prestaties zien", 2: "leveranciers berichten en bijwerken", 3: "leveranciers beheren, ook het portaal openzetten" },
		api: true,
	},
	{
		id: "affiliates",
		label: "Affiliates",
		icon: BadgePercent,
		levels: [0, 1, 2, 3],
		can: { 1: "het affiliateprogramma zien", 2: "aanmeldingen beoordelen en affiliates bijwerken", 3: "het programma beheren, ook uitbetalingen goedkeuren" },
		api: true,
	},
	{
		id: "automations",
		label: "Automatiseringen",
		icon: Workflow,
		levels: [0, 1, 2, 3],
		can: { 1: "flows en hun uitvoeringen zien", 2: "flows bouwen als concept", 3: "automatiseringen beheren, ook aanzetten en verwijderen" },
		api: true,
	},
	{
		id: "analytics",
		label: "Analyse",
		icon: ChartLine,
		levels: [0, 1],
		can: { 1: "omzet, marge en rapporten bekijken" },
		api: true,
	},
	{
		id: "data",
		label: "Data en export",
		icon: Database,
		levels: [0, 1, 2, 3],
		can: { 1: "het werkblad en de synchronisatie zien", 2: "importeren en het werkblad bewerken", 3: "data beheren, ook in bulk verwijderen" },
		api: true,
	},
	{
		id: "settings",
		label: "Instellingen",
		icon: Settings,
		levels: [0, 1, 2, 3],
		can: { 1: "winkel-, regio- en beveiligingsinstellingen lezen", 2: "instellingen wijzigen", 3: "instellingen beheren, ook winkels koppelen en ontkoppelen" },
		api: false,
	},
	{
		id: "team",
		label: "Team en rollen",
		icon: UserCog,
		levels: [0, 1, 2, 3],
		can: { 1: "zien wie er in het team zit", 2: "collega's uitnodigen", 3: "team en rollen beheren, ook rollen wijzigen en mensen verwijderen" },
		api: false,
	},
	{
		id: "billing",
		label: "Facturatie",
		icon: CreditCard,
		levels: [0, 1, 3],
		can: { 1: "het abonnement en de plekken zien", 3: "facturatie beheren, ook het abonnement en de betaalmethode" },
		api: false,
	},
	{
		id: "integrations",
		label: "Koppelingen en API",
		icon: Plug,
		levels: [0, 1, 2, 3],
		can: { 1: "koppelingen, sleutels en webhooks zien", 2: "koppelingen en webhooks instellen", 3: "API-sleutels aanmaken, roteren en intrekken" },
		api: false,
	},
];

export const AREA_BY_ID: Record<AreaId, Area> = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, Area>;

export type SpecialId = "refunds.write" | "disputes.write" | "data.export" | "customers.merge" | "automations.publish" | "billing.invoices" | "ai.autonomy" | "returns.approve" | "quality.approve" | "products.phase";

export type Special = {
	id: SpecialId;
	label: string;
	detail: string;
	/** The area level it only makes sense beside. Without it the switch is off and says why. */
	needs: { area: AreaId; level: Level };
};

export const SPECIALS: ReadonlyArray<Special> = [
	{ id: "refunds.write", label: "Terugbetalen", detail: "Geld teruggeven op een bestelling, tot het bedrag hieronder.", needs: { area: "orders", level: 2 } },
	{ id: "disputes.write", label: "Chargeback-bewijs indienen", detail: "Een bewijspakket naar Stripe, Klarna of PayPal sturen. Dat kan niet terug.", needs: { area: "chargebacks", level: 2 } },
	{ id: "data.export", label: "Exporteren", detail: "Bestellingen, klanten en producten als CSV downloaden.", needs: { area: "data", level: 1 } },
	{ id: "customers.merge", label: "Klanten samenvoegen", detail: "Dubbele profielen tot één klant maken, met hun bestellingen en tickets.", needs: { area: "customers", level: 2 } },
	{ id: "automations.publish", label: "Automatiseringen publiceren", detail: "Een flow live zetten, zodat hij uit naam van de werkruimte handelt.", needs: { area: "automations", level: 2 } },
	{ id: "billing.invoices", label: "Facturen bekijken", detail: "Facturen van Insyte openen en downloaden.", needs: { area: "billing", level: 1 } },
	{ id: "returns.approve", label: "Retouren goedkeuren", detail: "Een retour of claim goedkeuren of afwijzen. Terugbetalen blijft aan de terugbetaallimiet gebonden.", needs: { area: "returns", level: 2 } },
	{ id: "quality.approve", label: "Kwaliteit goedkeuren", detail: "Een kwaliteitscontrole van een leverancier goedkeuren of afkeuren.", needs: { area: "products", level: 2 } },
	{ id: "products.phase", label: "Productfase wijzigen", detail: "Een product op Test, Actief, Onder toezicht of Uitgefaseerd zetten.", needs: { area: "products", level: 2 } },
	{ id: "ai.autonomy", label: "Zelfstandigheid van Insyte instellen", detail: "Bepalen wat de Insyte-agent zelf mag doen, wat hij eerst vraagt, en het AI-budget.", needs: { area: "settings", level: 3 } },
];

export const SPECIAL_BY_ID: Record<SpecialId, Special> = Object.fromEntries(SPECIALS.map((s) => [s.id, s])) as Record<SpecialId, Special>;

/** Store scope: every store (also the ones connected later), or a pick. */
export type StoreScope = "all" | string[];

export type Permissions = {
	levels: Record<AreaId, Level>;
	specials: Record<SpecialId, boolean>;
	/** The most one refund may be, in euros; `null` is no limit. Read only when refunding is on. */
	refundLimit: number | null;
	stores: StoreScope;
};

export type RoleDef = Permissions & {
	id: string;
	label: string;
	/** One of the five roles every workspace has. They can be changed (not the owner) and put back. */
	system?: boolean;
	/** Made by the team. Only these can be renamed and deleted. */
	custom?: boolean;
	/** The role it was made from, for the diff the editor shows. */
	basedOn?: string;
	description?: string;
	createdAt?: number;
};

/* ── building roles ──────────────────────────────────────────────────────────────────────────── */

const ALL_AREAS = AREAS.map((a) => a.id);

/** The highest level an area offers at or below `want`. Facturatie has no Bewerken, so 2 becomes 1. */
export function clampLevel(area: AreaId, want: Level): Level {
	const levels = AREA_BY_ID[area].levels;
	let best: Level = 0;
	for (const l of levels) if (l <= want) best = l;
	return best;
}

export function makePermissions(
	levels: Partial<Record<AreaId, Level>>,
	specials: ReadonlyArray<SpecialId> = [],
	refundLimit: number | null = null,
	stores: StoreScope = "all",
): Permissions {
	return {
		levels: Object.fromEntries(ALL_AREAS.map((a) => [a, clampLevel(a, levels[a] ?? 0)])) as Record<AreaId, Level>,
		specials: Object.fromEntries(SPECIALS.map((s) => [s.id, specials.includes(s.id)])) as Record<SpecialId, boolean>,
		refundLimit,
		stores,
	};
}

const every = (l: Level) => Object.fromEntries(ALL_AREAS.map((a) => [a, l])) as Record<AreaId, Level>;
const ALL_SPECIALS = SPECIALS.map((s) => s.id);

/** The five roles a workspace starts with, as they come out of the box. "Standaard herstellen" puts these back. */
export const SYSTEM_DEFAULTS: Record<string, RoleDef> = {
	owner: {
		id: "owner",
		label: "Eigenaar",
		system: true,
		description: "Alles, altijd. Er is er één, en alleen die kan de werkruimte overdragen of verwijderen.",
		...makePermissions(every(3), ALL_SPECIALS),
	},
	admin: {
		id: "admin",
		label: "Beheerder",
		system: true,
		description: "Alles behalve het abonnement en de betaalmethode.",
		...makePermissions({ ...every(3), billing: 1 }, ALL_SPECIALS),
	},
	service: {
		id: "service",
		label: "Klantenservice",
		system: true,
		description: "Tickets, inbox en chats, met de bestellingen en klanten erachter.",
		...makePermissions(
			{ orders: 2, returns: 2, customers: 2, products: 1, support: 3, chargebacks: 2, suppliers: 1, automations: 1, team: 1 },
			["refunds.write", "disputes.write", "returns.approve"],
			100,
		),
	},
	finance: {
		id: "finance",
		label: "Financiën",
		system: true,
		description: "Geld: terugbetalingen, chargebacks, analyse en facturatie.",
		...makePermissions(
			{ orders: 2, returns: 1, customers: 1, products: 1, chargebacks: 3, suppliers: 1, affiliates: 2, analytics: 1, data: 1, billing: 3, team: 1 },
			["refunds.write", "disputes.write", "data.export", "billing.invoices"],
		),
	},
	view: {
		id: "view",
		label: "Alleen lezen",
		system: true,
		description: "Ziet wat er gebeurt en verandert niets.",
		...makePermissions({ orders: 1, returns: 1, customers: 1, products: 1, support: 1, chargebacks: 1, suppliers: 1, affiliates: 1, automations: 1, analytics: 1, data: 1, settings: 1, team: 1, integrations: 1 }),
	},
};

export const SYSTEM_ORDER = ["owner", "admin", "service", "finance", "view"];

/** The roles the seeded team made for itself, which the seeded people hold. */
export const SEED_CUSTOM: RoleDef[] = [
	{
		id: "cx-lead",
		label: "CX-lead",
		custom: true,
		basedOn: "service",
		createdAt: Date.parse("2024-09-02T09:00:00Z"),
		...makePermissions(
			{ orders: 2, returns: 2, customers: 3, products: 1, support: 3, chargebacks: 2, suppliers: 1, automations: 1, analytics: 1, team: 2 },
			["refunds.write", "disputes.write", "customers.merge", "returns.approve"],
			250,
		),
	},
	{
		id: "operations",
		label: "Operations",
		custom: true,
		basedOn: "admin",
		createdAt: Date.parse("2024-10-14T09:00:00Z"),
		...makePermissions(
			{ orders: 3, returns: 3, customers: 2, products: 3, support: 1, chargebacks: 1, suppliers: 3, automations: 3, analytics: 1, data: 2, settings: 1, team: 1, integrations: 1 },
			["refunds.write", "data.export", "automations.publish", "returns.approve", "quality.approve", "products.phase"],
			500,
			["store_us", "store_eu"],
		),
	},
	{
		id: "marketing",
		label: "Marketing",
		custom: true,
		basedOn: "view",
		createdAt: Date.parse("2025-04-07T09:00:00Z"),
		...makePermissions({ orders: 1, customers: 2, products: 2, affiliates: 3, automations: 2, analytics: 1, data: 1 }, ["data.export"], null, ["store_eu"]),
	},
];

/** In the busy week the team has grown a role for every corner of the business. */
export const BUSY_CUSTOM: RoleDef[] = [
	...SEED_CUSTOM,
	...(
		[
			["retour", "Retourbalie", "service", { orders: 2, returns: 3, customers: 1, support: 2 }, ["refunds.write", "returns.approve"], 75],
			["inkoop", "Inkoop en leveranciersbeheer Benelux", "view", { orders: 1, products: 3, suppliers: 3, analytics: 1, data: 1 }, ["data.export", "quality.approve", "products.phase"], null],
			["boekhouding", "Boekhouding (extern kantoor)", "finance", { orders: 1, chargebacks: 1, analytics: 1, billing: 1, data: 1 }, ["data.export", "billing.invoices"], null],
			["stagiair", "Stagiair klantenservice", "service", { orders: 1, customers: 1, support: 2 }, [], null],
			["nachtploeg", "Nachtploeg VS", "service", { orders: 2, customers: 2, support: 3, chargebacks: 1 }, ["refunds.write"], 50],
		] as const
	).map(
		([id, label, basedOn, levels, specials, limit], i): RoleDef => ({
			id,
			label,
			custom: true,
			basedOn,
			createdAt: Date.parse("2025-06-01T09:00:00Z") + i * 9 * 86_400_000,
			...makePermissions(levels, specials, limit, id === "nachtploeg" ? ["store_us"] : "all"),
		}),
	),
];

/**
 * A role stored before an area or a special action existed: the missing ones arrive at what the
 * system role has out of the box, or off for a role the team made. Used by the settings store's
 * migrations, so adding to the catalogue never leaves a role with a hole in it.
 */
export function completeRole<R extends Permissions & { id: string; system?: boolean }>(role: R): R {
	const base = role.system ? SYSTEM_DEFAULTS[role.id] : BUSY_CUSTOM.find((r) => r.id === role.id);
	const levels = { ...role.levels } as Record<AreaId, Level>;
	for (const a of AREAS) if (levels[a.id] === undefined) levels[a.id] = base?.levels[a.id] ?? 0;
	const specials = { ...role.specials } as Record<SpecialId, boolean>;
	for (const sp of SPECIALS) if (specials[sp.id] === undefined) specials[sp.id] = base?.specials[sp.id] ?? false;
	return { ...role, levels, specials };
}

/* ── asking ──────────────────────────────────────────────────────────────────────────────────── */

export type Permission = AreaId | SpecialId;
export const isSpecial = (p: Permission): p is SpecialId => p in SPECIAL_BY_ID;

/**
 * Whether a role may do something. An area is asked at a level (`can(role, "orders", 2)`); a special
 * action is asked plain, and refunding takes the amount (`can(role, "refunds.write", 180)`), which
 * the role's limit has to cover. The owner can always do everything.
 */
export function canRole(role: Permissions & { id?: string }, perm: Permission, arg?: Level | number): boolean {
	if (role.id === "owner") return true;
	if (isSpecial(perm)) {
		const s = SPECIAL_BY_ID[perm];
		if (!role.specials[perm] || role.levels[s.needs.area] < s.needs.level) return false;
		if (perm === "refunds.write" && typeof arg === "number" && role.refundLimit !== null) return arg <= role.refundLimit;
		return true;
	}
	return role.levels[perm] >= ((arg as Level | undefined) ?? 1);
}

/** The name of what is missing, the way a tooltip says it: "Bestellingen · Bewerken", "Terugbetalen". */
export function permissionName(perm: Permission, arg?: Level | number): string {
	if (isSpecial(perm)) {
		if (perm === "refunds.write" && typeof arg === "number") return `Terugbetalen boven ${euro(arg - 1)}`;
		return SPECIAL_BY_ID[perm].label;
	}
	return `${AREA_BY_ID[perm].label} · ${levelLabel((arg as Level | undefined) ?? 1)}`;
}

export const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/* ── which part of the console a path belongs to ────────────────────────────────────────────── */

/** Path prefixes and the area level opening them needs. Longest prefix wins; anything unlisted is open. */
const ROUTE_AREAS: ReadonlyArray<readonly [string, AreaId, Level]> = [
	["/orders", "orders", 1],
	["/returns", "returns", 1],
	["/settings/returns", "returns", 1],
	["/customers", "customers", 1],
	["/products", "products", 1],
	["/suppliers", "suppliers", 1],
	["/tickets", "support", 1],
	["/inbox", "support", 1],
	["/chats", "support", 1],
	["/chargebacks", "chargebacks", 1],
	["/automations", "automations", 1],
	["/analytics", "analytics", 1],
	["/data", "data", 1],
	["/affiliates", "affiliates", 1],
	["/settings/team", "team", 1],
	["/settings/roles", "team", 1],
	["/settings/billing", "billing", 1],
	["/settings/integrations", "integrations", 1],
	["/settings/apps", "integrations", 1],
	["/settings/api-keys", "integrations", 1],
	["/settings/webhooks", "integrations", 1],
	["/settings/agents", "integrations", 1],
	["/settings/stores", "settings", 1],
	["/settings/ai/knowledge", "settings", 1],
	["/settings/regional", "settings", 1],
	["/settings/security", "settings", 1],
];

export function areaForPath(pathname: string): { area: AreaId; level: Level } | null {
	let best: (typeof ROUTE_AREAS)[number] | null = null;
	for (const r of ROUTE_AREAS) {
		if ((pathname === r[0] || pathname.startsWith(`${r[0]}/`)) && (!best || r[0].length > best[0].length)) best = r;
	}
	return best ? { area: best[1], level: best[2] } : null;
}

/** The level a settings page needs before its fields can be changed, where it is not the page's own. */
export function editLevelForPath(pathname: string): { area: AreaId; level: Level } | null {
	// The Insyte AI pages are read by the whole team and changed with the ai.autonomy special, which
	// they gate themselves.
	if (pathname.startsWith("/settings/ai/")) return null;
	// Termijnen, regels and the portal shape what every shopper is told: Beheren, not Bewerken.
	if (pathname === "/settings/returns") return { area: "returns", level: 3 };
	const open = areaForPath(pathname);
	if (!open) return null;
	return { area: open.area, level: open.area === "billing" ? 3 : 2 };
}

export function canOpen(role: Permissions & { id?: string }, pathname: string): boolean {
	const need = areaForPath(pathname);
	return need ? canRole(role, need.area, need.level) : true;
}

/* ── saying it in Dutch ──────────────────────────────────────────────────────────────────────── */

/** "Koppelingen en API" → "koppelingen en API": a label in running text, its own capitals kept. */
export const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

const joinNl = (parts: ReadonlyArray<string>) =>
	parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} en ${parts.at(-1)}`;

export function storeScopeLabel(scope: StoreScope, stores: ReadonlyArray<{ id: string; name: string }>) {
	if (scope === "all") return "alle winkels";
	const names = scope.map((id) => stores.find((s) => s.id === id)?.name ?? id);
	return names.length === 0 ? "geen winkels" : joinNl(names);
}

/**
 * What a role can do, as a few plain sentences: what it manages, edits and only sees, what it may
 * not open at all, which money it may move, and where.
 */
export function describe(role: Permissions & { id?: string }, stores: ReadonlyArray<{ id: string; name: string }>): string[] {
	if (role.id === "owner") return ["Kan alles in de werkruimte, in alle winkels, en is de enige die de werkruimte kan overdragen of verwijderen."];
	const at = (l: Level) => AREAS.filter((a) => role.levels[a.id] === l);
	const out: string[] = [];
	const manage = at(3);
	const edit = at(2);
	const view = at(1);
	const none = at(0);
	if (manage.length) out.push(`Beheert ${joinNl(manage.map((a) => lower(a.label)))}.`);
	if (edit.length) out.push(`Kan ${joinNl(edit.map((a) => a.can[2]!))}.`);
	if (view.length) out.push(`Ziet ${joinNl(view.map((a) => lower(a.label)))}, maar wijzigt daar niets.`);
	if (none.length === AREAS.length) out.push("Kan nog niets openen. Kies per onderdeel wat deze rol mag.");
	else if (none.length) out.push(`Ziet ${joinNl(none.map((a) => lower(a.label)))} niet.`);
	const specials = SPECIALS.filter((s) => canRole(role, s.id));
	const refund = specials.find((s) => s.id === "refunds.write");
	const rest = specials.filter((s) => s.id !== "refunds.write").map((s) => lower(s.label));
	if (refund) out.push(role.refundLimit === null ? "Mag terugbetalen zonder limiet." : `Mag terugbetalen tot ${euro(role.refundLimit)} per bestelling.`);
	else if (role.levels.orders >= 2) out.push("Mag niet terugbetalen.");
	if (rest.length) out.push(`Mag ook: ${joinNl(rest)}.`);
	out.push(role.stores === "all" ? "Werkt in alle winkels, ook die later gekoppeld worden." : `Ziet alleen ${storeScopeLabel(role.stores, stores)}.`);
	return out;
}

export type Change = { key: string; label: string; from: string; to: string; up: boolean };

/** What is different between two roles, row by row, for the editor's diff and Vergelijk rollen. */
export function diff(base: Permissions, next: Permissions, stores: ReadonlyArray<{ id: string; name: string }>): Change[] {
	const out: Change[] = [];
	for (const a of AREAS) {
		const f = base.levels[a.id];
		const t = next.levels[a.id];
		if (f !== t) out.push({ key: a.id, label: a.label, from: levelLabel(f), to: levelLabel(t), up: t > f });
	}
	// A special action counts only where its area allows it, so switching the area off reads as losing it.
	const has = (p: Permissions, s: Special) => p.specials[s.id] && p.levels[s.needs.area] >= s.needs.level;
	for (const s of SPECIALS) {
		const f = has(base, s);
		const t = has(next, s);
		if (f !== t) out.push({ key: s.id, label: s.label, from: f ? "Aan" : "Uit", to: t ? "Aan" : "Uit", up: t });
	}
	if (base.refundLimit !== next.refundLimit && next.specials["refunds.write"]) {
		const show = (n: number | null) => (n === null ? "Geen limiet" : `Tot ${euro(n)}`);
		out.push({ key: "refundLimit", label: "Terugbetaallimiet", from: show(base.refundLimit), to: show(next.refundLimit), up: next.refundLimit === null || (base.refundLimit !== null && next.refundLimit > base.refundLimit) });
	}
	if (JSON.stringify(base.stores) !== JSON.stringify(next.stores)) {
		out.push({ key: "stores", label: "Winkels", from: storeScopeLabel(base.stores, stores), to: storeScopeLabel(next.stores, stores), up: next.stores === "all" });
	}
	return out;
}

/** A short line for a list row: "Beheert 3 · bewerkt 4 · ziet 5". */
export function summaryLine(role: Permissions & { id?: string }): string {
	if (role.id === "owner") return "Alles";
	const n = (l: Level) => AREAS.filter((a) => role.levels[a.id] === l).length;
	const parts = [n(3) ? `beheert ${n(3)}` : "", n(2) ? `bewerkt ${n(2)}` : "", n(1) ? `ziet ${n(1)}` : ""].filter(Boolean);
	const s = parts.join(" · ") || "nog niets";
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── API scopes, in the automation's ids ─────────────────────────────────────────────────────── */

export type ApiAccess = 0 | 1 | 2;
export const API_AREAS = AREAS.filter((a) => a.api);

/** `{ orders: 2, customers: 1 }` → ["orders.read", "orders.write", "customers.read"]. */
export function scopesOf(access: Partial<Record<AreaId, ApiAccess>>): string[] {
	return API_AREAS.flatMap((a) => {
		const v = access[a.id] ?? 0;
		return v === 0 ? [] : v === 1 ? [`${a.id}.read`] : [`${a.id}.read`, `${a.id}.write`];
	});
}

/** What a role means for a key: its levels read as read (1) or read and write (2 and up). */
export function apiAccessOfRole(role: Permissions): Partial<Record<AreaId, ApiAccess>> {
	return Object.fromEntries(API_AREAS.map((a) => [a.id, Math.min(2, role.levels[a.id]) as ApiAccess]));
}
