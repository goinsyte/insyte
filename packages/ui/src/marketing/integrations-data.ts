import type { Vendor } from "./parts.tsx"

/*
 * Every service Insyte connects to, for /koppelingen. Read off the console, not invented:
 * - `core`: the workspace's own connections (`stores/workspace-store.ts`, SEED_INTEGRATIONS);
 * - `marketplace`: the marketplace's extensions (`lib/mock-data/marketplace.ts`), their taglines as
 *   the console writes them — never their ratings or install counts, which are demo figures;
 * - `actions`: the automation builder's steps for that service
 *   (`components/automations/node-types.ts`).
 * Where a line says where the service shows up in Insyte, it names a screen the console has.
 */

export type Category =
  | "Winkel"
  | "Betalingen"
  | "E-mail"
  | "Marketing"
  | "Verzending en retouren"
  | "Klantenservice"
  | "Reviews"
  | "Risico"
  | "Team en data"
  | "Boekhouding"
  | "AI"

export type Integration = {
  readonly id: string
  /** A vendor's mark, or `mcp`: an open protocol rather than a vendor, drawn with an icon. */
  readonly vendor: Vendor | "mcp"
  readonly name: string
  readonly category: Category
  readonly line: string
  /** `Kern`: a connection Insyte builds for the first release (MVP in docs/backend/integrations.md); `Via de API`: a recipe on the API and webhooks; `Binnenkort`: planned ("Later"), shown in the console as Binnenkort. */
  readonly kind: "Kern" | "Via de API" | "Binnenkort"
  /** What Insyte reads or does with it. */
  readonly does: ReadonlyArray<string>
  /** The automation builder's steps that run on it. */
  readonly actions?: ReadonlyArray<string>
  /** This site's page about where it shows up. */
  readonly page?: { readonly label: string; readonly path: string }
  /** For a `Binnenkort` entry the console does not list yet: what to say instead of "staat als binnenkort". */
  readonly soonNote?: string
}

export const CATEGORIES: ReadonlyArray<Category> = [
  "Winkel",
  "Betalingen",
  "E-mail",
  "Marketing",
  "Verzending en retouren",
  "Klantenservice",
  "Reviews",
  "Risico",
  "Team en data",
  "Boekhouding",
  "AI"
]

export const INTEGRATIONS: ReadonlyArray<Integration> = [
  {
    id: "shopify",
    vendor: "shopify",
    name: "Shopify",
    category: "Winkel",
    kind: "Kern",
    line: "Bestellingen, producten en klanten, van elke winkel die je koppelt.",
    does: [
      "Koppelt via OAuth; meerdere winkels in één werkruimte",
      "Leest bestellingen, klanten, producten en afhandelingen",
      "Triggert automatiseringen, zoals een late levering"
    ],
    actions: ["Bestelling bijwerken", "Label op bestelling", "Fulfilment aanmaken"],
    page: { label: "Bestellingen", path: "/product/bestellingen" }
  },
  {
    id: "stripe",
    vendor: "stripe",
    name: "Stripe",
    category: "Betalingen",
    kind: "Kern",
    line: "Kaartbetalingen, terugbetalingen en geschillen.",
    does: ["Geschillen komen binnen met hun deadline", "Het bewijspakket ligt klaar om in te dienen"],
    actions: ["Terugbetalen via Stripe", "Betaling opzoeken"],
    page: { label: "Chargebacks", path: "/product/chargebacks" }
  },
  {
    id: "klarna",
    vendor: "klarna",
    name: "Klarna",
    category: "Betalingen",
    kind: "Kern",
    line: "Geschillen en betalingen.",
    does: ["Geschillen komen binnen met hun deadline", "Bewijs gaat terug naar Klarna als jij indient"],
    actions: ["Terugbetalen via Klarna", "Geschil beantwoorden"],
    page: { label: "Chargebacks", path: "/product/chargebacks" }
  },
  {
    id: "paypal",
    vendor: "paypal",
    name: "PayPal",
    category: "Betalingen",
    kind: "Kern",
    line: "Geschillen en betalingen.",
    does: ["Geschillen komen binnen met hun deadline", "Partners kunnen naar PayPal worden uitbetaald"],
    actions: ["Terugbetalen via PayPal"],
    page: { label: "Chargebacks", path: "/product/chargebacks" }
  },
  {
    id: "gmail",
    vendor: "gmail",
    name: "Gmail",
    category: "E-mail",
    kind: "Kern",
    line: "Inbox en gesprekken.",
    does: ["Gesprekken komen in de gedeelde inbox", "Antwoorden gaan vanuit de gekoppelde mailbox"],
    actions: ["Mail via Gmail"],
    page: { label: "Klantenservice", path: "/product/klantenservice" }
  },
  {
    id: "outlook",
    vendor: "outlook",
    name: "Outlook",
    category: "E-mail",
    kind: "Kern",
    line: "Inbox en gesprekken.",
    does: ["Gesprekken komen in de gedeelde inbox", "Antwoorden gaan vanuit de gekoppelde mailbox"],
    actions: ["Mail via Outlook"],
    page: { label: "Klantenservice", path: "/product/klantenservice" }
  },
  {
    id: "klaviyo",
    vendor: "klaviyo",
    name: "Klaviyo",
    category: "Marketing",
    kind: "Kern",
    line: "Synchroniseer segmenten en e-mailflows direct naar klantprofielen.",
    does: ["Klanten synchroniseren naar Klaviyo", "Campagnes pauzeren bij lage voorraad"],
    actions: ["E-mail via Klaviyo", "Aan lijst toevoegen", "Campagne pauzeren"],
    page: { label: "Automatiseringen", path: "/product/automatiseringen" }
  },
  {
    id: "anthropic",
    vendor: "anthropic",
    name: "Anthropic",
    category: "AI",
    kind: "Kern",
    line: "Claude, het model achter de Insyte-agent.",
    does: [
      "Schrijft concepten en voorstellen, en werkt binnen de regels die jij stelt",
      "Invoer wordt niet gebruikt om modellen te trainen"
    ],
    actions: ["Samenvatten", "Bedoeling herkennen", "Bestellingen koppelen"],
    page: { label: "Insyte AI", path: "/product/insyte-ai" }
  },
  {
    // ADR-0027, docs/backend/api.md §8: planned, not built. Scoped like an API key.
    id: "mcp",
    vendor: "mcp",
    name: "MCP-server",
    category: "AI",
    kind: "Binnenkort",
    line: "Je eigen AI-tools lezen en werken in Insyte, met dezelfde rechten als een API-sleutel.",
    does: [
      "Gepland: bestellingen, tickets, klanten en geschillen lezen vanuit een AI-tool die MCP spreekt",
      "Acties lopen via dezelfde regels als de Insyte-agent: wat op Eerst vragen staat, komt als voorstel in de console",
      "Elke aanroep in het auditlog, op naam van de sleutel"
    ],
    page: { label: "Insyte AI", path: "/product/insyte-ai" },
    soonNote: "Gepland, nog niet gebouwd. Tot dan werken je eigen agents met Insyte via API-sleutels en webhooks."
  },
  {
    id: "recharge",
    vendor: "recharge",
    name: "Recharge",
    category: "Winkel",
    kind: "Binnenkort",
    line: "Abonnementen, verlengingen en betalingsherinneringen, direct in Insyte.",
    does: ["Abonnementen bij de klant en de bestelling"]
  },
  {
    id: "yotpo",
    vendor: "yotpo",
    name: "Yotpo Reviews",
    category: "Reviews",
    kind: "Binnenkort",
    line: "Toon reviews, scores en UGC naast het klantprofiel.",
    does: ["Reviews naast het klantprofiel"]
  },
  {
    id: "okendo",
    vendor: "okendo",
    name: "Okendo",
    category: "Reviews",
    kind: "Binnenkort",
    line: "Reviews, UGC en loyaliteit samen in de klantprofielen van Insyte.",
    does: ["Reviews en loyaliteit in het klantprofiel"]
  },
  {
    id: "shipbob",
    vendor: "shipbob",
    name: "ShipBob",
    category: "Verzending en retouren",
    kind: "Binnenkort",
    line: "Koppel voorraad en uitgaande zendingen uit ShipBob-magazijnen.",
    does: ["Voorraad en zendingen uit ShipBob-magazijnen"]
  },
  {
    id: "aftership",
    vendor: "aftership",
    name: "AfterShip",
    category: "Verzending en retouren",
    kind: "Kern",
    line: "Track & trace-pagina's in je huisstijl en proactieve bezorgmeldingen.",
    does: ["Bezorgstatus bij de bestelling"]
  },
  {
    id: "loop",
    vendor: "loop",
    name: "Loop Returns",
    category: "Verzending en retouren",
    kind: "Binnenkort",
    line: "Selfservice-retourportaal met omruilen en tegoed.",
    does: ["Retouren en omruilingen bij de bestelling"]
  },
  {
    id: "dhl",
    vendor: "dhl",
    name: "DHL",
    category: "Verzending en retouren",
    kind: "Binnenkort",
    line: "Zendingen volgen en retourlabels maken, als stap in een flow. Gepland.",
    does: [
      "Gepland: tracking en retourlabels rechtstreeks bij DHL",
      "Leveranciers kunnen DHL nu al als vervoerder opgeven"
    ],
    actions: ["Zending volgen", "Retourlabel maken"],
    page: { label: "Automatiseringen", path: "/product/automatiseringen" }
  },
  {
    id: "postnl",
    vendor: "postnl",
    name: "PostNL",
    category: "Verzending en retouren",
    kind: "Binnenkort",
    line: "Zendingen volgen en retourlabels maken, als stap in een flow. Gepland.",
    does: [
      "Gepland: tracking en retourlabels rechtstreeks bij PostNL",
      "Leveranciers kunnen PostNL nu al als vervoerder opgeven"
    ],
    actions: ["Zending volgen", "Retourlabel maken"],
    page: { label: "Automatiseringen", path: "/product/automatiseringen" }
  },
  {
    id: "sendcloud",
    vendor: "sendcloud",
    name: "Sendcloud",
    category: "Verzending en retouren",
    kind: "Binnenkort",
    line: "Label en track & trace via Sendcloud, als stap in een flow. Gepland.",
    does: ["Verzendlabels maken vanuit een automatisering"],
    actions: ["Verzendlabel maken"],
    page: { label: "Automatiseringen", path: "/product/automatiseringen" }
  },
  {
    id: "gorgias",
    vendor: "gorgias",
    name: "Gorgias",
    category: "Klantenservice",
    kind: "Binnenkort",
    line: "Importeer oude tickets en macro's om inbox en tickets direct op te starten.",
    does: ["Oude tickets en macro's importeren"],
    actions: ["Ticket in Gorgias"]
  },
  {
    id: "signifyd",
    vendor: "signifyd",
    name: "Signifyd",
    category: "Risico",
    kind: "Binnenkort",
    line: "Fraudescore op elke bestelling.",
    does: ["Een fraudescore bij de bestelling"]
  },
  {
    id: "postscript",
    vendor: "postscript",
    name: "Postscript",
    category: "Marketing",
    kind: "Binnenkort",
    line: "Sms-marketingflows gestart door Insyte-events.",
    does: ["Sms-flows starten vanuit Insyte"]
  },
  {
    id: "googleads",
    vendor: "googleads",
    name: "Google Ads",
    category: "Marketing",
    kind: "Binnenkort",
    line: "Stuur klantwaarde-signalen naar Google Ads voor slimmer bieden.",
    does: ["Klantwaarde naar Google Ads"]
  },
  {
    id: "slack",
    vendor: "slack",
    name: "Slack",
    category: "Team en data",
    kind: "Kern",
    line: "Een bericht in een kanaal of aan een collega, als stap in een flow.",
    does: ["Meldingen naar Slack sturen"],
    actions: ["Bericht in kanaal", "Privébericht"],
    page: { label: "Automatiseringen", path: "/product/automatiseringen" }
  },
  {
    id: "teams",
    vendor: "teams",
    name: "Microsoft Teams",
    category: "Team en data",
    kind: "Binnenkort",
    line: "Een bericht in een Teams-kanaal, als stap in een flow. Gepland.",
    does: ["Meldingen naar Teams sturen"],
    actions: ["Bericht in Teams"],
    page: { label: "Automatiseringen", path: "/product/automatiseringen" }
  },
  {
    id: "microsoft",
    vendor: "microsoft",
    name: "Microsoft 365",
    category: "Team en data",
    kind: "Binnenkort",
    line: "Een agenda-item of een rij in Excel, als stap in een flow. Gepland.",
    does: ["Agenda en Excel vanuit een automatisering"],
    actions: ["Agenda-item", "Rij in Excel"],
    page: { label: "Automatiseringen", path: "/product/automatiseringen" }
  },
  {
    id: "sheets",
    vendor: "sheets",
    name: "Google Sheets",
    category: "Team en data",
    kind: "Binnenkort",
    line: "Een regel toevoegen aan een spreadsheet, als stap in een flow. Gepland.",
    does: ["Rijen toevoegen vanuit een automatisering"],
    actions: ["Rij toevoegen"],
    page: { label: "Automatiseringen", path: "/product/automatiseringen" }
  },
  {
    id: "exact",
    vendor: "exact",
    name: "Exact Online",
    category: "Boekhouding",
    kind: "Binnenkort",
    line: "Verkoopfacturen en creditnota's boeken, als stap in een flow. Gepland.",
    does: ["Bestellingen en terugbetalingen naar de boekhouding"],
    actions: ["Verkoopfactuur boeken", "Creditnota boeken"],
    page: { label: "Automatiseringen", path: "/product/automatiseringen" }
  },
  {
    id: "zapier",
    vendor: "zapier",
    name: "Zapier",
    category: "Team en data",
    kind: "Via de API",
    line: "Koppel Insyte zonder code aan de apps die hier niet staan.",
    does: ["Insyte-gebeurtenissen naar andere apps via webhooks"]
  }
]
