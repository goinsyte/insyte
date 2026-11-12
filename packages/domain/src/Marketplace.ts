/*
 * The Marketplace's catalogue (M17 step 3), in code: one source for the console's cards and the server that installs
 * them. A `CATALOG` KV override (apps added or retired without a deploy) can come later; until then a change here is
 * a release. Each app says how it installs:
 *
 * - `connect`: it is one of Insyte's own connections; installing it is that connection's connect flow (Klaviyo's OAuth).
 * - `key`: a recipe app that talks to Insyte's public API; installing it makes a scoped API key for it, shown once.
 *   An outbound webhook endpoint joins it once Insyte sends webhooks (M19.4).
 * - `soon`: neither exists yet; the card says Binnenkort and nothing installs.
 *
 * The copy is the design's (`marketplace/app-catalog.ts`, the `extensions` fixture), word for word.
 */

export type AppKind = "Integration" | "App" | "Coaching" | "Agency"

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
  | "productivity"

export type AppBadge = "editors_choice" | "best_seller" | "new" | "trending"

/** A connection Insyte already makes for a workspace, whose own flow an app's install starts. */
export type AppProvider = "klaviyo"

export type AppInstall =
  | { readonly kind: "connect"; readonly provider: AppProvider }
  | { readonly kind: "key" }
  | { readonly kind: "soon" }

/** What an app may do once installed, as the detail lists it; the id is what a revoked scope is stored as. */
export interface AppScope {
  readonly id: string
  readonly label: string
}

export interface CatalogApp {
  readonly id: string
  readonly name: string
  readonly tagline: string
  /** The listing's own shelf ("E-mail en sms"), as the design's fixture names it. */
  readonly listing: string
  readonly kind: AppKind
  readonly category: AppCategory
  readonly badge?: AppBadge
  readonly rating: number
  readonly installCount: number
  readonly vendorUrl: string
  readonly pricing: string
  readonly features: ReadonlyArray<string>
  readonly scopes: ReadonlyArray<AppScope>
  readonly install: AppInstall
}

export const CATALOG: ReadonlyArray<CatalogApp> = [
  {
    id: "ext_klaviyo",
    name: "Klaviyo",
    tagline: "Synchroniseer segmenten en e-mailflows direct naar klantprofielen.",
    listing: "E-mail en sms",
    kind: "Integration",
    category: "marketing",
    badge: "best_seller",
    rating: 4.8,
    installCount: 14200,
    vendorUrl: "klaviyo.com",
    pricing: "Gratis te installeren · op basis van gebruik",
    features: [
      "Tweerichtingssynchronisatie van segmenten en lifecycle-flows",
      "Klantevents stromen direct naar Klaviyo-profielen",
      "Doorklikken naar e-mailprestaties per klant"
    ],
    scopes: [
      { id: "profiles.read", label: "Klantprofielen, bestellingen en labels lezen" },
      { id: "subscriptions.write", label: "Abonneestatus en segmentlidmaatschap schrijven" },
      { id: "events.send", label: "Marketingevents namens jou versturen" }
    ],
    install: { kind: "connect", provider: "klaviyo" }
  },
  {
    id: "ext_recharge",
    name: "Recharge",
    tagline: "Abonnementen, verlengingen en betalingsherinneringen · direct in Insyte.",
    listing: "Abonnementen",
    kind: "Integration",
    category: "finance",
    badge: "trending",
    rating: 4.7,
    installCount: 8900,
    vendorUrl: "rechargepayments.com",
    pricing: "Vanaf US$ 99 per maand",
    features: [
      "Abonnementsfacturatie en betalingsherinneringen",
      "Selfserviceportaal voor klanten, ingebouwd in Insyte",
      "Prognose van klantverloop op het klantprofiel"
    ],
    scopes: [
      { id: "subscriptions.write", label: "Abonnementsbestellingen lezen en schrijven" },
      { id: "charges.write", label: "Klanten periodiek laten betalen" },
      { id: "payment_methods.read", label: "Opgeslagen betaalmethoden lezen" }
    ],
    install: { kind: "soon" }
  },
  {
    id: "ext_yotpo",
    name: "Yotpo Reviews",
    tagline: "Toon reviews, scores en UGC naast het klantprofiel.",
    listing: "Reviews",
    kind: "App",
    category: "marketing",
    rating: 4.6,
    installCount: 6200,
    vendorUrl: "yotpo.com",
    pricing: "Gratis te installeren · betaalde abonnementen beschikbaar",
    features: [
      "Geverifieerde reviews zichtbaar bij elke klant",
      "UGC-carrousels in supportantwoorden",
      "Een dalende score waarschuwt je CS-team"
    ],
    scopes: [
      { id: "catalog.read", label: "Product- en bestelgegevens lezen" },
      { id: "review_requests.send", label: "E-mails met reviewverzoeken naar klanten sturen" }
    ],
    install: { kind: "soon" }
  },
  {
    id: "ext_shipbob",
    name: "ShipBob",
    tagline: "Koppel voorraad en uitgaande zendingen uit ShipBob-magazijnen.",
    listing: "Afhandeling",
    kind: "Integration",
    category: "logistics",
    rating: 4.5,
    installCount: 4700,
    vendorUrl: "shipbob.com",
    pricing: "Gratis te installeren",
    features: [
      "Realtime voorraad over alle ShipBob-magazijnen",
      "Zending automatisch aangemaakt bij overdracht aan leverancier",
      "Track & trace-webhooks werken de tijdlijn van de bestelling bij"
    ],
    scopes: [
      { id: "orders.read", label: "Bestel-, adres- en SKU-gegevens lezen" },
      { id: "fulfilment.write", label: "Afhandelingsstatus en track & trace schrijven" }
    ],
    install: { kind: "soon" }
  },
  {
    id: "ext_gorgias",
    name: "Gorgias",
    tagline: "Importeer oude tickets en macro's om inbox en tickets direct op te starten.",
    listing: "Support",
    kind: "Integration",
    category: "customer_service",
    badge: "editors_choice",
    rating: 4.4,
    installCount: 5500,
    vendorUrl: "gorgias.com",
    pricing: "Vanaf US$ 10 per maand",
    features: [
      "Oude Gorgias-tickets en macro's importeren",
      "Macro's uitvoeren vanuit de Insyte-inbox tijdens de overstap",
      "Statuswijzigingen van tickets 90 dagen terugsynchroniseren"
    ],
    scopes: [
      { id: "history.read", label: "Oude Gorgias-tickets en macro's lezen (eenmalig)" },
      { id: "tickets.sync", label: "Statusupdates van tickets terugsynchroniseren" }
    ],
    install: { kind: "soon" }
  },
  {
    id: "ext_signifyd",
    name: "Signifyd",
    tagline: "Fraudescore op elke bestelling, met chargeback-garantie.",
    listing: "Risico",
    kind: "App",
    category: "finance",
    badge: "editors_choice",
    rating: 4.6,
    installCount: 3800,
    vendorUrl: "signifyd.com",
    pricing: "Prijs op maat",
    features: [
      "Fraudescore op elke bestelling bij het afrekenen",
      "Chargeback-garantie voor beschermde bestellingen",
      "Risicovolle bestellingen krijgen automatisch een label voor handmatige controle"
    ],
    scopes: [
      { id: "checkout.read", label: "Bestel-, betaal- en verzendgegevens lezen bij het afrekenen" },
      { id: "orders.tag", label: "Bestellingen labelen met fraudesignalen" }
    ],
    install: { kind: "soon" }
  },
  {
    id: "ext_aftership",
    name: "AfterShip",
    tagline: "Track & trace-pagina's in je huisstijl en proactieve bezorgmeldingen.",
    listing: "Logistiek",
    kind: "Integration",
    category: "logistics",
    badge: "best_seller",
    rating: 4.5,
    installCount: 9100,
    vendorUrl: "aftership.com",
    pricing: "Gratis te installeren · US$ 9 per maand per 100 zendingen",
    features: [
      "Track & trace-pagina's in je eigen merkkleuren",
      "Proactieve meldingen bij bezorgproblemen",
      "Vervoerderonafhankelijk · werkt met 1.100+ vervoerders"
    ],
    scopes: [
      { id: "shipments.read", label: "Zendings- en track & trace-gegevens lezen" },
      { id: "notifications.send", label: "Bezorgmeldingen in je eigen huisstijl naar klanten sturen" }
    ],
    install: { kind: "soon" }
  },
  {
    id: "ext_loop",
    name: "Loop Returns",
    tagline: "Selfservice-retourportaal met omruilen en tegoed.",
    listing: "Retouren",
    kind: "App",
    category: "customer_service",
    badge: "best_seller",
    rating: 4.7,
    installCount: 6800,
    vendorUrl: "loopreturns.com",
    pricing: "Vanaf US$ 29 per maand",
    features: [
      "Selfservice-retourportaal met omruilen en tegoed",
      "Retourredenen komen in de analyse van Insyte",
      "Terugbetalingen of vervangingen automatisch op basis van regels"
    ],
    scopes: [
      { id: "orders.read", label: "Bestel- en klantgegevens lezen" },
      { id: "refunds.write", label: "Terugbetalingen, tegoed en omruilingen uitvoeren" }
    ],
    install: { kind: "soon" }
  },
  {
    id: "ext_okendo",
    name: "Okendo",
    tagline: "Reviews, UGC en loyaliteit samen in de klantprofielen van Insyte.",
    listing: "Reviews",
    kind: "App",
    category: "marketing",
    badge: "new",
    rating: 4.7,
    installCount: 5200,
    vendorUrl: "okendo.io",
    pricing: "Vanaf US$ 19 per maand",
    features: [
      "Reviews, UGC en loyaliteit in één klantprofiel",
      "Gerichte reviewverzoeken per bestellabel",
      "Vergelijking naast elkaar op productpagina's"
    ],
    scopes: [
      { id: "catalog.read", label: "Bestel- en productgegevens lezen" },
      { id: "review_requests.send", label: "Meldingen met reviewverzoeken versturen" }
    ],
    install: { kind: "soon" }
  },
  {
    id: "ext_postscript",
    name: "Postscript",
    tagline: "Sms-marketingflows gestart door Insyte-events.",
    listing: "E-mail en sms",
    kind: "Integration",
    category: "marketing",
    badge: "trending",
    rating: 4.6,
    installCount: 6300,
    vendorUrl: "postscript.io",
    pricing: "Gratis te installeren · US$ 25 per maand",
    features: [
      "Sms-flows gestart door Insyte-events",
      "Sms-gesprekken in twee richtingen in de Insyte-inbox",
      "Opt-ins verzamelen die aan de regels voldoen"
    ],
    scopes: [
      { id: "phones.read", label: "Telefoonnummers en toestemmingsstatus van klanten lezen" },
      { id: "sms.send", label: "Sms-berichten namens jou versturen" }
    ],
    install: { kind: "soon" }
  },
  {
    id: "ext_zapier",
    name: "Zapier",
    tagline: "Koppel Insyte zonder code aan 5.000+ apps.",
    listing: "Automatisering",
    kind: "Integration",
    category: "ai",
    badge: "editors_choice",
    rating: 4.4,
    installCount: 12400,
    vendorUrl: "zapier.com",
    pricing: "Gratis · betaalde niveaus",
    features: [
      "Koppel Insyte zonder code aan 5.000+ apps",
      "Triggers voor bestellingen, tickets, chargebacks en klanten",
      "Zaps met meerdere stappen, ingebouwde vertraging en filter"
    ],
    scopes: [
      { id: "events.read", label: "Events lezen die je via Zaps start" },
      { id: "data.write", label: "Schrijven naar alles wat je Insyte-abonnement beschikbaar stelt" }
    ],
    install: { kind: "key" }
  },
  {
    id: "ext_googleads",
    name: "Google Ads",
    tagline: "Stuur LTV-signalen van klanten naar Google Ads voor slimmer bieden.",
    listing: "Advertenties",
    kind: "Integration",
    category: "marketing",
    rating: 4.3,
    installCount: 3100,
    vendorUrl: "ads.google.com",
    pricing: "Gratis",
    features: [
      "LTV-signalen van klanten naar Google Ads sturen",
      "Slim bieden op basis van echte margedata",
      "Doelgroepsynchronisatie voor retargeting en lookalikes"
    ],
    scopes: [
      { id: "ltv.read", label: "Samengevoegde bestel- en LTV-gegevens van klanten lezen" },
      { id: "audiences.send", label: "Doelgroeplijsten naar je Google Ads-account sturen" }
    ],
    install: { kind: "soon" }
  }
]

export const CATALOG_BY_ID: Readonly<Record<string, CatalogApp>> = Object.fromEntries(CATALOG.map((a) => [a.id, a]))

/** The shelves the editors keep, in their order. */
export const COLLECTIONS = {
  featured: ["ext_klaviyo", "ext_gorgias", "ext_zapier", "ext_aftership", "ext_loop", "ext_signifyd"],
  trending: ["ext_postscript", "ext_recharge", "ext_okendo"],
  editors: ["ext_gorgias", "ext_zapier", "ext_signifyd"]
} as const satisfies Record<string, ReadonlyArray<string>>

/** Whether an install can be done here, or the card says Binnenkort. */
export const installable = (app: CatalogApp) => app.install.kind !== "soon"

/** A recipe app's key, by the scopes it still holds: reading every area the API reaches, and writing to them. */
export const KEY_SCOPES = { read: "events.read", write: "data.write" } as const
