import { products } from "./mock-data/products";
import { referralLinks } from "./mock-data/referrals";
import type { ReferralLink } from "@insyte/ui/app/lib/types/domain";
import type { Conversion, ConversionStatus, AffStatement } from "@insyte/ui/data-source";
export type { Conversion, ConversionStatus, AffStatement };

/**
 * The affiliate's conversions: every order that came through one of its links, with what it was
 * worth and the commission on it. Generated once per link from the link's own totals, so the rows
 * add up to the figures the links show, and every figure on the affiliate's pages can be opened
 * down to the orders it counts.
 */

export const COMMISSION = 0.15;
/** The affiliate's world ends where the store's history does. */
export const AFF_TODAY = Date.parse("2026-05-26T20:00:00Z");
const DAY = 86_400_000;


export const RETURN_DAYS = 14;

/** The 15th of the month after `t`, when that month's commission is paid. */
export function payDayOf(t: number) {
	const d = new Date(t);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15, 10);
}

function mulberry(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const live = products.filter((p) => p.status === "active");

function build(): Conversion[] {
	const out: Conversion[] = [];
	let seq = 0;
	for (const [li, link] of referralLinks.entries()) {
		const r = mulberry(4000 + li);
		const start = Date.parse(link.created_at);
		// Later days carry more weight, the way a link picks up as it is shared.
		const span = AFF_TODAY - start;
		const raw = Array.from({ length: link.conversions }, () => {
			const p = live[Math.floor(r() * live.length)]!;
			return { at: start + Math.sqrt(r()) * span, p, q: r() < 0.85 ? 1 : 2 };
		});
		const gross = raw.reduce((n, x) => n + x.p.price * x.q, 0);
		const scale = link.revenue / gross;
		for (const x of raw.sort((a, b) => a.at - b.at)) {
			seq += 1;
			const total = Math.round(x.p.price * x.q * scale);
			const age = AFF_TODAY - x.at;
			const returned = r() < 0.04;
			out.push({
				id: `cv_${seq}`,
				link: link.id,
				at: new Date(x.at).toISOString(),
				order: `NW-${40000 + seq}`,
				title: x.p.title,
				total,
				commission: Math.round(total * COMMISSION * 100) / 100,
				status: age >= RETURN_DAYS * DAY && returned ? "reversed" : payDayOf(x.at) <= AFF_TODAY ? "paid" : age < RETURN_DAYS * DAY ? "pending" : "approved",
			});
		}
	}
	return out.sort((a, b) => b.at.localeCompare(a.at));
}

export const CONVERSIONS = build();

/** Clicks and conversions per week for the last eight weeks, for one link or all of them. */
export function weeklyFor(links: ReadonlyArray<ReferralLink>, linkId?: string) {
	const mine = linkId ? CONVERSIONS.filter((c) => c.link === linkId) : CONVERSIONS;
	const ratio = (id?: string) => {
		const ls = id ? links.filter((l) => l.id === id) : links;
		const clicks = ls.reduce((n, l) => n + l.clicks, 0);
		const conv = ls.reduce((n, l) => n + l.conversions, 0);
		return conv === 0 ? 14 : clicks / conv;
	};
	const perConv = ratio(linkId);
	return Array.from({ length: 8 }, (_, i) => {
		const to = AFF_TODAY - (7 - i) * 7 * DAY;
		const from = to - 7 * DAY;
		const xs = mine.filter((c) => {
			const t = Date.parse(c.at);
			return t > from && t <= to;
		});
		return {
			label: new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(new Date(to)),
			conversions: xs.length,
			clicks: Math.round(xs.length * perConv),
			earned: Math.round(xs.reduce((n, c) => n + c.commission, 0)),
		};
	});
}

/** The program's tiers, as the brand set them. */
export const TIERS = [
	{ id: "bronze", label: "Brons", rate: 10, from: 0 },
	{ id: "silver", label: "Zilver", rate: 12, from: 100 },
	{ id: "gold", label: "Goud", rate: 15, from: 250 },
] as const;

/** Where the destination picker can send a link. */
export const DESTINATIONS = [
	{ id: "home", label: "Startpagina", path: "" },
	{ id: "new", label: "Collectie · Nieuw binnen", path: "collections/nieuw" },
	{ id: "outerwear", label: "Collectie · Jassen", path: "collections/jassen" },
	...live.slice(0, 10).map((p) => ({ id: p.id, label: `Product · ${p.title}`, path: `products/${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}` })),
];

export const CONVERSION_STATUS: Record<ConversionStatus, { label: string; tone: "warning" | "info" | "success" | "neutral" }> = {
	pending: { label: "In retourtermijn", tone: "warning" },
	approved: { label: "Goedgekeurd", tone: "info" },
	paid: { label: "Uitbetaald", tone: "success" },
	reversed: { label: "Teruggedraaid", tone: "neutral" },
};


const MONTH = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" });
const sum = (xs: Conversion[]) => Math.round(xs.reduce((n, c) => n + c.commission, 0) * 100) / 100;

/** The affiliate's months, newest first: what came in, what was taken back, and when it is paid. */
export function affiliateStatements(): AffStatement[] {
	const by = new Map<string, Conversion[]>();
	for (const c of CONVERSIONS) {
		const k = c.at.slice(0, 7);
		by.set(k, [...(by.get(k) ?? []), c]);
	}
	return [...by.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([id, rows]) => {
			const at = Date.parse(`${id}-01T00:00:00Z`);
			const gross = sum(rows);
			const reversed = sum(rows.filter((c) => c.status === "reversed"));
			const payDay = payDayOf(at);
			const label = MONTH.format(new Date(at));
			return { id, label: label.charAt(0).toUpperCase() + label.slice(1), rows, gross, reversed, total: Math.round((gross - reversed) * 100) / 100, status: payDay <= AFF_TODAY ? "paid" : "open", payDay };
		});
}
