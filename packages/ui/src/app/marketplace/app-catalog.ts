import { Bot, Mail, Package, Plug, Settings, ShoppingBag, Star, Truck, type IconComponent, Zap } from "../../icons";

export type AppKind = "Integration" | "App" | "Coaching" | "Agency";

export const KIND_STYLE: Record<AppKind, { bg: string; text: string }> = {
	Integration: { bg: "var(--arc-tint)", text: "var(--arc-ink)" },
	App: { bg: "var(--arc-tint)", text: "var(--arc-ink)" },
	Coaching: { bg: "var(--signal-amber-bg)", text: "var(--signal-amber)" },
	Agency: { bg: "var(--signal-green-bg)", text: "var(--signal-green)" },
};

/** The kind as the operator reads it. */
export const KIND_LABEL: Record<AppKind, string> = {
	Integration: "Koppeling",
	App: "App",
	Coaching: "Coaching",
	Agency: "Bureau",
};

export const KIND_FOR: Record<string, AppKind> = {
	ext_klaviyo: "Integration",
	ext_recharge: "Integration",
	ext_yotpo: "App",
	ext_shipbob: "Integration",
	ext_gorgias: "Integration",
	ext_signifyd: "App",
	ext_aftership: "Integration",
	ext_loop: "App",
	ext_okendo: "App",
	ext_postscript: "Integration",
	ext_zapier: "Integration",
	ext_googleads: "Integration",
};

export type AppCategory =
	| "ecommerce"
	| "marketing"
	| "customer_service"
	| "analytics"
	| "finance"
	| "logistics"
	| "ai"
	| "communication"
	| "integrations"
	| "productivity";

export const CATEGORY_LABEL: Record<AppCategory, string> = {
	ecommerce: "E-commerce",
	marketing: "Marketing",
	customer_service: "Klantenservice",
	analytics: "Analyse",
	finance: "Financiën",
	logistics: "Logistiek",
	ai: "AI en automatisering",
	communication: "Communicatie",
	integrations: "Koppelingen",
	productivity: "Productiviteit",
};

export const CATEGORIES_ORDER: AppCategory[] = [
	"ecommerce",
	"marketing",
	"customer_service",
	"analytics",
	"finance",
	"logistics",
	"ai",
	"communication",
	"integrations",
	"productivity",
];

export const CATEGORY_FOR: Record<string, AppCategory> = {
	ext_klaviyo: "marketing",
	ext_recharge: "finance",
	ext_yotpo: "marketing",
	ext_shipbob: "logistics",
	ext_gorgias: "customer_service",
	ext_signifyd: "finance",
	ext_aftership: "logistics",
	ext_loop: "customer_service",
	ext_okendo: "marketing",
	ext_postscript: "marketing",
	ext_zapier: "ai",
	ext_googleads: "marketing",
};

export type AppBadge = "editors_choice" | "best_seller" | "new" | "trending";

export const BADGE_FOR: Record<string, AppBadge> = {
	ext_klaviyo: "best_seller",
	ext_gorgias: "editors_choice",
	ext_signifyd: "editors_choice",
	ext_aftership: "best_seller",
	ext_loop: "best_seller",
	ext_zapier: "editors_choice",
	ext_recharge: "trending",
	ext_postscript: "trending",
	ext_okendo: "new",
};

export const BADGE_LABEL: Record<AppBadge, string> = {
	editors_choice: "Keuze van de redactie",
	best_seller: "Bestseller",
	new: "Nieuw",
	trending: "Populair",
};

export const FEATURED_IDS: string[] = [
	"ext_klaviyo",
	"ext_gorgias",
	"ext_zapier",
	"ext_aftership",
	"ext_loop",
	"ext_signifyd",
];

export const TRENDING_IDS: string[] = [
	"ext_postscript",
	"ext_recharge",
	"ext_okendo",
];

export const EDITORS_CHOICE_IDS: string[] = [
	"ext_gorgias",
	"ext_zapier",
	"ext_signifyd",
];

export const ICON_FOR: Record<string, IconComponent> = {
	ext_klaviyo: Mail,
	ext_recharge: Zap,
	ext_yotpo: Star,
	ext_shipbob: Truck,
	ext_gorgias: Bot,
	ext_signifyd: Settings,
	ext_aftership: Truck,
	ext_loop: Package,
	ext_okendo: Star,
	ext_postscript: Mail,
	ext_zapier: Plug,
	ext_googleads: ShoppingBag,
};

export const VENDOR_URL: Record<string, string> = {
	ext_klaviyo: "klaviyo.com",
	ext_recharge: "rechargepayments.com",
	ext_yotpo: "yotpo.com",
	ext_shipbob: "shipbob.com",
	ext_gorgias: "gorgias.com",
	ext_signifyd: "signifyd.com",
	ext_aftership: "aftership.com",
	ext_loop: "loopreturns.com",
	ext_okendo: "okendo.io",
	ext_postscript: "postscript.io",
	ext_zapier: "zapier.com",
	ext_googleads: "ads.google.com",
};

export const PRICING_FOR: Record<string, string> = {
	ext_klaviyo: "Gratis te installeren · op basis van gebruik",
	ext_recharge: "Vanaf US$ 99 per maand",
	ext_yotpo: "Gratis te installeren · betaalde abonnementen beschikbaar",
	ext_shipbob: "Gratis te installeren",
	ext_gorgias: "Vanaf US$ 10 per maand",
	ext_signifyd: "Prijs op maat",
	ext_aftership: "Gratis te installeren · US$ 9 per maand per 100 zendingen",
	ext_loop: "Vanaf US$ 29 per maand",
	ext_okendo: "Vanaf US$ 19 per maand",
	ext_postscript: "Gratis te installeren · US$ 25 per maand",
	ext_zapier: "Gratis · betaalde niveaus",
	ext_googleads: "Gratis",
};

export const FEATURES_FOR: Record<string, string[]> = {
	ext_klaviyo: [
		"Tweerichtingssynchronisatie van segmenten en lifecycle-flows",
		"Klantevents stromen direct naar Klaviyo-profielen",
		"Doorklikken naar e-mailprestaties per klant",
	],
	ext_recharge: [
		"Abonnementsfacturatie en betalingsherinneringen",
		"Selfserviceportaal voor klanten, ingebouwd in Insyte",
		"Prognose van klantverloop op het klantprofiel",
	],
	ext_yotpo: [
		"Geverifieerde reviews zichtbaar bij elke klant",
		"UGC-carrousels in supportantwoorden",
		"Een dalende score waarschuwt je CS-team",
	],
	ext_shipbob: [
		"Realtime voorraad over alle ShipBob-magazijnen",
		"Zending automatisch aangemaakt bij overdracht aan leverancier",
		"Track & trace-webhooks werken de tijdlijn van de bestelling bij",
	],
	ext_gorgias: [
		"Oude Gorgias-tickets en macro's importeren",
		"Macro's uitvoeren vanuit de Insyte-inbox tijdens de overstap",
		"Statuswijzigingen van tickets 90 dagen terugsynchroniseren",
	],
	ext_signifyd: [
		"Fraudescore op elke bestelling bij het afrekenen",
		"Chargeback-garantie voor beschermde bestellingen",
		"Risicovolle bestellingen krijgen automatisch een label voor handmatige controle",
	],
	ext_aftership: [
		"Track & trace-pagina's in je eigen merkkleuren",
		"Proactieve meldingen bij bezorgproblemen",
		"Vervoerderonafhankelijk · werkt met 1.100+ vervoerders",
	],
	ext_loop: [
		"Selfservice-retourportaal met omruilen en tegoed",
		"Retourredenen komen in de analyse van Insyte",
		"Terugbetalingen of vervangingen automatisch op basis van regels",
	],
	ext_okendo: [
		"Reviews, UGC en loyaliteit in één klantprofiel",
		"Gerichte reviewverzoeken per bestellabel",
		"Vergelijking naast elkaar op productpagina's",
	],
	ext_postscript: [
		"Sms-flows gestart door Insyte-events",
		"Sms-gesprekken in twee richtingen in de Insyte-inbox",
		"Opt-ins verzamelen die aan de regels voldoen",
	],
	ext_zapier: [
		"Koppel Insyte zonder code aan 5.000+ apps",
		"Triggers voor bestellingen, tickets, chargebacks en klanten",
		"Zaps met meerdere stappen, ingebouwde vertraging en filter",
	],
	ext_googleads: [
		"LTV-signalen van klanten naar Google Ads sturen",
		"Slim bieden op basis van echte margedata",
		"Doelgroepsynchronisatie voor retargeting en lookalikes",
	],
};

export const PERMISSIONS_FOR: Record<string, string[]> = {
	ext_klaviyo: [
		"Klantprofielen, bestellingen en labels lezen",
		"Abonneestatus en segmentlidmaatschap schrijven",
		"Marketingevents namens jou versturen",
	],
	ext_recharge: [
		"Abonnementsbestellingen lezen en schrijven",
		"Klanten periodiek laten betalen",
		"Opgeslagen betaalmethoden lezen",
	],
	ext_yotpo: [
		"Product- en bestelgegevens lezen",
		"E-mails met reviewverzoeken naar klanten sturen",
	],
	ext_shipbob: [
		"Bestel-, adres- en SKU-gegevens lezen",
		"Afhandelingsstatus en track & trace schrijven",
	],
	ext_gorgias: [
		"Oude Gorgias-tickets en macro's lezen (eenmalig)",
		"Statusupdates van tickets terugsynchroniseren",
	],
	ext_signifyd: [
		"Bestel-, betaal- en verzendgegevens lezen bij het afrekenen",
		"Bestellingen labelen met fraudesignalen",
	],
	ext_aftership: [
		"Zendings- en track & trace-gegevens lezen",
		"Bezorgmeldingen in je eigen huisstijl naar klanten sturen",
	],
	ext_loop: [
		"Bestel- en klantgegevens lezen",
		"Terugbetalingen, tegoed en omruilingen uitvoeren",
	],
	ext_okendo: [
		"Bestel- en productgegevens lezen",
		"Meldingen met reviewverzoeken versturen",
	],
	ext_postscript: [
		"Telefoonnummers en toestemmingsstatus van klanten lezen",
		"Sms-berichten namens jou versturen",
	],
	ext_zapier: [
		"Events lezen die je via Zaps start",
		"Schrijven naar alles wat je Insyte-abonnement beschikbaar stelt",
	],
	ext_googleads: [
		"Samengevoegde bestel- en LTV-gegevens van klanten lezen",
		"Doelgroeplijsten naar je Google Ads-account sturen",
	],
};

export function vendorName(name: string) {
	return name.replace(/ Pro$| Plus$/, "");
}

export function formatInstalls(n: number) {
	if (n >= 1000) return `${(Math.round(n / 100) / 10).toLocaleString("nl-NL")}k+ installaties`;
	return `${n} ${n === 1 ? "installatie" : "installaties"}`;
}
