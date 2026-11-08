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
import {
	AREAS as CATALOGUE,
	canRole,
	levelLabel,
	makePermissions,
	SPECIAL_BY_ID,
	SPECIALS,
	SYSTEM_DEFAULTS,
	isSpecial,
	type Area as CatalogueArea,
	type AreaId,
	type Level,
	type Permission,
	type Permissions,
	type RoleDef,
	type Special,
	type SpecialId,
	type StoreScope,
} from "@insyte/domain/Permissions";

/*
 * The permission catalogue lives in `@insyte/domain/Permissions`, where the server checks it (ADR-0010). This file
 * keeps the import path every screen already uses, and adds what only the console needs: each area's icon, the
 * demo's seeded roles, and the Dutch sentences the roles page and the gates say.
 */
export * from "@insyte/domain/Permissions";

export type Area = CatalogueArea & { icon: IconComponent };

const ICONS: Record<AreaId, IconComponent> = {
	orders: ShoppingBag,
	returns: RotateCcw,
	customers: Users,
	products: Box,
	support: MessagesSquare,
	chargebacks: CornerDownLeft,
	suppliers: Truck,
	affiliates: BadgePercent,
	automations: Workflow,
	analytics: ChartLine,
	data: Database,
	settings: Settings,
	team: UserCog,
	billing: CreditCard,
	integrations: Plug,
};

export const AREAS: ReadonlyArray<Area> = CATALOGUE.map((a) => ({ ...a, icon: ICONS[a.id] }));
export const AREA_BY_ID: Record<AreaId, Area> = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, Area>;
export const API_AREAS = AREAS.filter((a) => a.api);

/* ── the demo's roles ────────────────────────────────────────────────────────────────────────── */

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

/* ── the name of what is missing ─────────────────────────────────────────────────────────────── */

/** The name of what is missing, the way a tooltip says it: "Bestellingen · Bewerken", "Terugbetalen". */
export function permissionName(perm: Permission, arg?: Level | number): string {
	if (isSpecial(perm)) {
		if (perm === "refunds.write" && typeof arg === "number") return `Terugbetalen boven ${euro(arg - 1)}`;
		return SPECIAL_BY_ID[perm].label;
	}
	return `${AREA_BY_ID[perm].label} · ${levelLabel((arg as Level | undefined) ?? 1)}`;
}

export const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/* ── saying it in Dutch ──────────────────────────────────────────────────────────────────────── */

/** "Koppelingen en API" → "koppelingen en API": a label in running text, its own capitals kept. */
export const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

export const joinNl = (parts: ReadonlyArray<string>) =>
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
