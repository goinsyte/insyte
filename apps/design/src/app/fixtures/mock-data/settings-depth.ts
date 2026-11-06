import type { SettingsDepthSeed } from "@insyte/ui/data-source";
import { byScenario } from "../scenario";

/*
 * Settings depth (PLAN 43) for Northwind. The sending domain is half set up (SPF and DMARC found,
 * MX and DKIM not yet), the trash holds a week of deletions, and the log the last changes. The
 * first day starts with the defaults and nothing in the log or the trash.
 */

const D = 86_400_000;
const at = (days: number, h = 10) => new Date(Date.now() - days * D + (h - 10) * 3_600_000).toISOString();

const SHIPPING: SettingsDepthSeed["shipping"] = [
	{ id: "info", carrier: "Label aangemaakt", label: "Je bestelling is verzonden", show: "all", tone: "neutral", orders: 3 },
	{ id: "supplier", carrier: "Bij de leverancier", label: "We maken je bestelling klaar", show: "line", tone: "neutral", orders: 6 },
	{ id: "country", carrier: "Onderweg naar het land", label: "Onderweg", show: "line", tone: "neutral", orders: 4 },
	{ id: "local", carrier: "Bij de lokale vervoerder", label: "Onderweg met {vervoerder}", show: "all", tone: "arc", orders: 9 },
	{ id: "noinfo", carrier: "Nog geen info van de vervoerder", label: "Verzonden", show: "all", tone: "neutral", orders: 2 },
	{ id: "transit", carrier: "Onderweg", label: "Onderweg", show: "all", tone: "arc", orders: 14 },
	{ id: "pickup", carrier: "Klaar om op te halen", label: "Ligt klaar om op te halen", show: "all", tone: "arc", orders: 1 },
	{ id: "out", carrier: "Wordt vandaag bezorgd", label: "Wordt vandaag bezorgd", show: "all", tone: "arc", orders: 5 },
	{ id: "failed", carrier: "Bezorging mislukt", label: "Bezorgpoging mislukt", show: "all", tone: "red", orders: 1 },
	{ id: "exception", carrier: "Probleem met de zending", label: "We kijken naar je zending", show: "all", tone: "amber", orders: 2 },
	{ id: "stale", carrier: "Geen updates meer", label: "Onderweg", show: "line", tone: "neutral", orders: 3 },
	{ id: "delivered", carrier: "Bezorgd", label: "Bezorgd", show: "all", tone: "green", orders: 41 },
];

const SETTLED: SettingsDepthSeed = {
	shipping: SHIPPING,
	links: { review: "https://northwind.store/pages/review", unsubscribe: "", restock: "" },
	brand: { color: "#1F3A5F", font: "Systeem", sender: "Northwind", website: "https://northwind.store", support: "support@northwind.store", widget: "right" },
	domain: {
		domain: "northwind.store",
		checkedAt: at(2),
		checks: 0,
		from: "service@northwind.store",
		replyTo: "support@northwind.store",
		records: [
			{ id: "mx", type: "MX", name: "send", value: "feedback-smtp.eu-west-1.amazonses.com", status: "missing", why: "Er staat nog geen MX-record op send.northwind.store." },
			{ id: "spf", type: "TXT", name: "send", value: "v=spf1 include:amazonses.com ~all", status: "found" },
			{ id: "dkim", type: "TXT", name: "resend._domainkey", value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC8…", status: "missing", why: "De sleutel staat er nog niet. Een nieuw record kan tot 24 uur duren." },
			{ id: "dmarc", type: "TXT", name: "_dmarc", value: "v=DMARC1; p=none;", status: "found" },
		],
	},
	vat: {
		stores: [
			{ storeId: "store_us", currency: "USD", vatOnShipping: false, refundInclVat: false },
			{ storeId: "store_eu", currency: "EUR", vatOnShipping: true, refundInclVat: true },
		],
		oss: true,
		ossNumber: "NL123456789B01",
	},
	privacy: {
		erasing: false,
		classes: [
			{ id: "contact", label: "Klantcontact", detail: "E-mails, chats en WhatsApp-berichten met klanten, met hun tickets en notities.", months: 24, count: 312 },
			{ id: "uploads", label: "Bijlagen", detail: "Foto's uit het retourportaal en bijlagen bij e-mails.", months: 24, count: 87 },
			{ id: "logs", label: "Logboeken", detail: "Inlogpogingen, webhookverzoeken en wat Insyte deed.", months: 3, count: 1_940 },
			{ id: "ads", label: "Advertentielog", detail: "Wat een automatisering met Meta Ads deed: budgetten, pauzes, de cijfers erbij.", months: 24, count: 0 },
			{ id: "courses", label: "Cursusvoortgang", detail: "Antwoorden, scores en herkansingen per teamlid.", months: 12, count: 4 },
			{ id: "customers", label: "Klantgegevens", detail: "Naam, adres en e-mail van klanten zonder bestelling in deze periode.", months: 36, count: 58 },
		],
	},
	audit: [
		{ id: "a1", at: at(0, 9), who: "Elena Hart", page: "Team", to: "/settings/team", field: "Uitnodiging", before: "—", after: "jesse@northwind.co" },
		{ id: "a2", at: at(1, 16), who: "Elena Hart", page: "Zelfstandigheid", to: "/settings/ai/autonomy", field: "Ticket toewijzen", before: "Eerst vragen", after: "Zelf doen" },
		{ id: "a3", at: at(1, 11), who: "Sofía Kim", page: "Retouren", to: "/settings/returns", field: "Termijn voor een retour", before: "14 dagen", after: "30 dagen" },
		{ id: "a4", at: at(3, 14), who: "Elena Hart", page: "Regio", to: "/settings/regional", field: "Valuta", before: "USD", after: "EUR" },
		{ id: "a5", at: at(3, 13), who: "Elena Hart", page: "Regio", to: "/settings/regional", field: "Valuta", before: "EUR", after: "USD" },
		{ id: "a6", at: at(4, 10), who: "Liam Tucker", page: "Koppelingen", to: "/settings/integrations", field: "Meta Ads", before: "Niet gekoppeld", after: "Gekoppeld" },
		{ id: "a7", at: at(6, 15), who: "Sofía Kim", page: "Klantagent", to: "/settings/ai/customer-agent", field: "Openingstijden", before: "9:00–17:00", after: "8:30–17:30" },
		{ id: "a8", at: at(9, 9), who: "Elena Hart", page: "Limieten", to: "/settings/ai/limits", field: "Maandlimiet", before: "$ 150", after: "$ 250" },
	],
	trash: [
		{ id: "t1", kind: "ticket", title: "Dubbele bestelling SO-12198", by: "Sofía Kim", at: at(1) },
		{ id: "t2", kind: "sjabloon", title: "Black Friday — kortingscode verlopen", by: "Elena Hart", at: at(3) },
		{ id: "t3", kind: "automatisering", title: "Oude retourflow (2025)", by: "Elena Hart", at: at(6) },
		{ id: "t4", kind: "notitie", title: "Notitie bij Lena Vos: belt liever", by: "Amber Lewis", at: at(8) },
		{ id: "t5", kind: "rekenblad", title: "Test marge Q1", by: "Liam Tucker", at: at(19) },
		{ id: "t6", kind: "klant", title: "test@northwind.store", by: "Elena Hart", at: at(27) },
	],
};

const EMPTY: SettingsDepthSeed = {
	...SETTLED,
	links: { review: "", unsubscribe: "", restock: "" },
	domain: { ...SETTLED.domain, records: SETTLED.domain.records.map((r) => ({ ...r, status: "missing" as const, why: "Nog niet toegevoegd bij je domeinbeheerder." })) },
	privacy: { ...SETTLED.privacy, classes: SETTLED.privacy.classes.map((c) => ({ ...c, count: 0 })) },
	shipping: SHIPPING.map((s) => ({ ...s, orders: 0 })),
	audit: [],
	trash: [],
};

export const settingsDepthSeed: SettingsDepthSeed = byScenario({ empty: EMPTY, settled: SETTLED });
