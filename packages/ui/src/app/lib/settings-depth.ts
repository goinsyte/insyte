/*
 * Settings depth (PLAN 43): the workspace settings this console lacked.
 * Shipment wording for the customer, fixed links in reply templates, the brand the customer sees,
 * the sending domain, VAT per store, how long each kind of data is kept, the log of every settings
 * change, the trash, and the go-to shortcuts.
 */

export type ShipTone = "neutral" | "arc" | "amber" | "red" | "green";
export type ShipStatus = { id: string; carrier: string; label: string; show: "all" | "line" | "hidden"; tone: ShipTone; orders: number };

export type TemplateLinks = { review: string; unsubscribe: string; restock: string };

export type Brand = { logo?: string; color: string; font: "Systeem" | "Inter" | "Georgia"; sender: string; website: string; support: string; widget: "right" | "left" };

export type DnsRecord = { id: string; type: "MX" | "TXT" | "CNAME"; name: string; value: string; status: "found" | "missing" | "pending"; why?: string };
export type Domain = { domain: string; records: DnsRecord[]; checkedAt: string; checks: number; from: string; replyTo: string };

export type StoreVat = { storeId: string; currency: "EUR" | "USD" | "GBP"; vatOnShipping: boolean; refundInclVat: boolean };
export type Vat = { stores: StoreVat[]; oss: boolean; ossNumber: string };

export type Retention = { id: string; label: string; detail: string; months: number | null; count: number };
export type Privacy = { classes: Retention[]; erasing: boolean; countedAt?: string };

export type AuditEntry = { id: string; at: string; who: string; page: string; to: string; field: string; before: string; after: string };
export type TrashItem = { id: string; kind: "ticket" | "klant" | "automatisering" | "rekenblad" | "sjabloon" | "notitie"; title: string; by: string; at: string };

export type GoTo = { id: string; label: string; to: string; key: string };

export type SettingsDepthSeed = {
	shipping: ShipStatus[];
	links: TemplateLinks;
	brand: Brand;
	domain: Domain;
	vat: Vat;
	privacy: Privacy;
	audit: AuditEntry[];
	trash: TrashItem[];
};

export const TRASH_DAYS = 30;

/** The carrier statuses as the page names them, in its order, with the tone of each (Verzending). */
export const SHIP_CARRIERS: ReadonlyArray<{ id: string; carrier: string; tone: ShipTone }> = [
	{ id: "info", carrier: "Label aangemaakt", tone: "neutral" },
	{ id: "supplier", carrier: "Bij de leverancier", tone: "neutral" },
	{ id: "country", carrier: "Onderweg naar het land", tone: "neutral" },
	{ id: "local", carrier: "Bij de lokale vervoerder", tone: "arc" },
	{ id: "noinfo", carrier: "Nog geen info van de vervoerder", tone: "neutral" },
	{ id: "transit", carrier: "Onderweg", tone: "arc" },
	{ id: "pickup", carrier: "Klaar om op te halen", tone: "arc" },
	{ id: "out", carrier: "Wordt vandaag bezorgd", tone: "arc" },
	{ id: "failed", carrier: "Bezorging mislukt", tone: "red" },
	{ id: "exception", carrier: "Probleem met de zending", tone: "amber" },
	{ id: "stale", carrier: "Geen updates meer", tone: "neutral" },
	{ id: "delivered", carrier: "Bezorgd", tone: "green" },
];

/** The kinds of data a period is kept for, as Gegevens en privacy names them. */
export const RETENTION_COPY: ReadonlyArray<{ id: string; label: string; detail: string }> = [
	{ id: "contact", label: "Klantcontact", detail: "E-mails, chats en WhatsApp-berichten met klanten, met hun tickets en notities." },
	{ id: "uploads", label: "Bijlagen", detail: "Foto's uit het retourportaal en bijlagen bij e-mails." },
	{ id: "logs", label: "Logboeken", detail: "Inlogpogingen, webhookverzoeken en wat Insyte deed." },
	{ id: "ads", label: "Advertentielog", detail: "Wat een automatisering met Meta Ads deed: budgetten, pauzes, de cijfers erbij." },
	{ id: "courses", label: "Cursusvoortgang", detail: "Antwoorden, scores en herkansingen per teamlid." },
	{ id: "customers", label: "Klantgegevens", detail: "Naam, adres en e-mail van klanten zonder bestelling in deze periode." },
];

export const GOTO_DEFAULTS: ReadonlyArray<GoTo> = [
	{ id: "dashboard", label: "Dashboard", to: "/dashboard", key: "D" },
	{ id: "orders", label: "Bestellingen", to: "/orders", key: "B" },
	{ id: "tickets", label: "Tickets", to: "/tickets", key: "T" },
	{ id: "inbox", label: "Inbox", to: "/inbox", key: "I" },
	{ id: "chats", label: "Chats", to: "/chats", key: "C" },
	{ id: "customers", label: "Klanten", to: "/customers", key: "K" },
	{ id: "products", label: "Producten", to: "/products", key: "P" },
	{ id: "returns", label: "Retouren", to: "/returns", key: "R" },
	{ id: "analytics", label: "Analyse", to: "/analytics", key: "A" },
	{ id: "sheets", label: "Rekenbladen", to: "/sheets", key: "S" },
	{ id: "courses", label: "Cursussen", to: "/courses", key: "U" },
	{ id: "live", label: "Live", to: "/live", key: "L" },
	{ id: "notifications", label: "Meldingen", to: "/notifications", key: "N" },
	{ id: "settings", label: "Instellingen", to: "/settings/profile", key: "," },
];

/** A wording with the carrier filled in, the way the customer reads it. */
export const filled = (label: string, carrier = "PostNL") => label.replace(/\{vervoerder\}/gi, carrier);

/** WCAG relative luminance contrast between two hex colours. */
export function contrast(a: string, b: string): number {
	const lum = (hex: string) => {
		const h = hex.replace("#", "");
		const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
		const [r, g, bl] = [0, 2, 4].map((i) => {
			const v = Number.parseInt(n.slice(i, i + 2), 16) / 255;
			return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
	};
	const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
	return (x! + 0.05) / (y! + 0.05);
}

export const isHex = (s: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
