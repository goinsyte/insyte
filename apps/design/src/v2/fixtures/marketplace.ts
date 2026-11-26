/**
 * Marketplace: apps and integrations from other makers, next to the connections Insyte has itself.
 * Rebuilt from the current demo's catalog (`packages/domain/src/Marketplace.ts`) without its ratings,
 * install counts and "best seller" badges: those were invented and this version never shows numbers
 * about other people's customers. Brand marks only for the four real integrations (Shopify, Stripe,
 * Meta, Resend); every other app is a letter on a tile.
 */

export type AppCategory = "marketing" | "customer_service" | "finance" | "logistics" | "ai"
export const CATEGORY_LABEL: Readonly<Record<AppCategory, string>> = {
  marketing: "Marketing",
  customer_service: "Klantenservice",
  finance: "Financiën",
  logistics: "Logistiek",
  ai: "AI en automatisering"
}

export type AppScope = { readonly id: string; readonly label: string }
export type AppInstall =
  | { readonly kind: "connect"; readonly provider: string }
  | {
    readonly kind: "key"
    readonly areas: ReadonlyArray<string>
    readonly write: boolean
    readonly expiresInDays: number | null
  }
  | { readonly kind: "soon" }

export type App = {
  readonly id: string
  readonly name: string
  readonly tagline: string
  readonly listing: string
  readonly kind: string
  readonly category: AppCategory
  readonly vendorUrl: string
  readonly pricing: string
  readonly features: ReadonlyArray<string>
  readonly scopes: ReadonlyArray<AppScope>
  readonly install: AppInstall
}

export const CATALOG: ReadonlyArray<App> = [
  {
    id: "klaviyo",
    name: "Klaviyo",
    tagline: "Synchroniseer segmenten en e-mailflows direct naar klantprofielen.",
    listing: "E-mail en sms",
    kind: "Koppeling",
    category: "marketing",
    vendorUrl: "klaviyo.com",
    pricing: "Gratis te installeren · op basis van gebruik",
    features: [
      "Tweerichtingssynchronisatie van segmenten en lifecycle-flows",
      "Klantevents stromen direct naar Klaviyo-profielen",
      "Doorklikken naar e-mailprestaties per klant"
    ],
    scopes: [
      {
        id: "profiles.read",
        label: "Klantprofielen, bestellingen en labels lezen"
      },
      {
        id: "subscriptions.write",
        label: "Abonneestatus en segmentlidmaatschap schrijven"
      },
      {
        id: "events.send",
        label: "Marketingevents namens jou versturen"
      }
    ],
    install: {
      kind: "connect",
      provider: "klaviyo"
    }
  },
  {
    id: "recharge",
    name: "Recharge",
    tagline: "Abonnementen, verlengingen en betalingsherinneringen · direct in Insyte.",
    listing: "Abonnementen",
    kind: "Koppeling",
    category: "finance",
    vendorUrl: "rechargepayments.com",
    pricing: "Vanaf US$ 99 per maand",
    features: [
      "Abonnementsfacturatie en betalingsherinneringen",
      "Selfserviceportaal voor klanten, ingebouwd in Insyte",
      "Prognose van klantverloop op het klantprofiel"
    ],
    scopes: [
      {
        id: "subscriptions.write",
        label: "Abonnementsbestellingen lezen en schrijven"
      },
      {
        id: "charges.write",
        label: "Klanten periodiek laten betalen"
      },
      {
        id: "payment_methods.read",
        label: "Opgeslagen betaalmethoden lezen"
      }
    ],
    install: {
      kind: "soon"
    }
  },
  {
    id: "yotpo",
    name: "Yotpo Reviews",
    tagline: "Toon reviews, scores en UGC naast het klantprofiel.",
    listing: "Reviews",
    kind: "App",
    category: "marketing",
    vendorUrl: "yotpo.com",
    pricing: "Gratis te installeren · betaalde abonnementen beschikbaar",
    features: [
      "Geverifieerde reviews zichtbaar bij elke klant",
      "UGC-carrousels in supportantwoorden",
      "Een dalende score waarschuwt je CS-team"
    ],
    scopes: [
      {
        id: "catalog.read",
        label: "Product- en bestelgegevens lezen"
      },
      {
        id: "review_requests.send",
        label: "E-mails met reviewverzoeken naar klanten sturen"
      }
    ],
    install: {
      kind: "soon"
    }
  },
  {
    id: "shipbob",
    name: "ShipBob",
    tagline: "Koppel voorraad en uitgaande zendingen uit ShipBob-magazijnen.",
    listing: "Afhandeling",
    kind: "Koppeling",
    category: "logistics",
    vendorUrl: "shipbob.com",
    pricing: "Gratis te installeren",
    features: [
      "Realtime voorraad over alle ShipBob-magazijnen",
      "Zending automatisch aangemaakt bij overdracht aan leverancier",
      "Track & trace-webhooks werken de tijdlijn van de bestelling bij"
    ],
    scopes: [
      {
        id: "orders.read",
        label: "Bestel-, adres- en SKU-gegevens lezen"
      },
      {
        id: "fulfilment.write",
        label: "Afhandelingsstatus en track & trace schrijven"
      }
    ],
    install: {
      kind: "soon"
    }
  },
  {
    id: "gorgias",
    name: "Gorgias",
    tagline: "Importeer oude tickets en macro's om inbox en tickets direct op te starten.",
    listing: "Support",
    kind: "Koppeling",
    category: "customer_service",
    vendorUrl: "gorgias.com",
    pricing: "Vanaf US$ 10 per maand",
    features: [
      "Oude Gorgias-tickets en macro's importeren",
      "Macro's uitvoeren vanuit de Insyte-inbox tijdens de overstap",
      "Statuswijzigingen van tickets 90 dagen terugsynchroniseren"
    ],
    scopes: [
      {
        id: "history.read",
        label: "Oude Gorgias-tickets en macro's lezen (eenmalig)"
      },
      {
        id: "tickets.sync",
        label: "Statusupdates van tickets terugsynchroniseren"
      }
    ],
    install: {
      kind: "soon"
    }
  },
  {
    id: "signifyd",
    name: "Signifyd",
    tagline: "Fraudescore op elke bestelling, met chargeback-garantie.",
    listing: "Risico",
    kind: "App",
    category: "finance",
    vendorUrl: "signifyd.com",
    pricing: "Prijs op maat",
    features: [
      "Fraudescore op elke bestelling bij het afrekenen",
      "Chargeback-garantie voor beschermde bestellingen",
      "Risicovolle bestellingen krijgen automatisch een label voor handmatige controle"
    ],
    scopes: [
      {
        id: "checkout.read",
        label: "Bestel-, betaal- en verzendgegevens lezen bij het afrekenen"
      },
      {
        id: "orders.tag",
        label: "Bestellingen labelen met fraudesignalen"
      }
    ],
    install: {
      kind: "soon"
    }
  },
  {
    id: "aftership",
    name: "AfterShip",
    tagline: "Track & trace-pagina's in je huisstijl en proactieve bezorgmeldingen.",
    listing: "Logistiek",
    kind: "Koppeling",
    category: "logistics",
    vendorUrl: "aftership.com",
    pricing: "Gratis te installeren · US$ 9 per maand per 100 zendingen",
    features: [
      "Track & trace-pagina's in je eigen merkkleuren",
      "Proactieve meldingen bij bezorgproblemen",
      "Vervoerderonafhankelijk · werkt met 1.100+ vervoerders"
    ],
    scopes: [
      {
        id: "shipments.read",
        label: "Zendings- en track & trace-gegevens lezen"
      },
      {
        id: "notifications.send",
        label: "Bezorgmeldingen in je eigen huisstijl naar klanten sturen"
      }
    ],
    install: {
      kind: "soon"
    }
  },
  {
    id: "loop",
    name: "Loop Returns",
    tagline: "Selfservice-retourportaal met omruilen en tegoed.",
    listing: "Retouren",
    kind: "App",
    category: "customer_service",
    vendorUrl: "loopreturns.com",
    pricing: "Vanaf US$ 29 per maand",
    features: [
      "Selfservice-retourportaal met omruilen en tegoed",
      "Retourredenen komen in de analyse van Insyte",
      "Terugbetalingen of vervangingen automatisch op basis van regels"
    ],
    scopes: [
      {
        id: "orders.read",
        label: "Bestel- en klantgegevens lezen"
      },
      {
        id: "refunds.write",
        label: "Terugbetalingen, tegoed en omruilingen uitvoeren"
      }
    ],
    install: {
      kind: "soon"
    }
  },
  {
    id: "okendo",
    name: "Okendo",
    tagline: "Reviews, UGC en loyaliteit samen in de klantprofielen van Insyte.",
    listing: "Reviews",
    kind: "App",
    category: "marketing",
    vendorUrl: "okendo.io",
    pricing: "Vanaf US$ 19 per maand",
    features: [
      "Reviews, UGC en loyaliteit in één klantprofiel",
      "Gerichte reviewverzoeken per bestellabel",
      "Vergelijking naast elkaar op productpagina's"
    ],
    scopes: [
      {
        id: "catalog.read",
        label: "Bestel- en productgegevens lezen"
      },
      {
        id: "review_requests.send",
        label: "Meldingen met reviewverzoeken versturen"
      }
    ],
    install: {
      kind: "soon"
    }
  },
  {
    id: "postscript",
    name: "Postscript",
    tagline: "Sms-marketingflows gestart door Insyte-events.",
    listing: "E-mail en sms",
    kind: "Koppeling",
    category: "marketing",
    vendorUrl: "postscript.io",
    pricing: "Gratis te installeren · US$ 25 per maand",
    features: [
      "Sms-flows gestart door Insyte-events",
      "Sms-gesprekken in twee richtingen in de Insyte-inbox",
      "Opt-ins verzamelen die aan de regels voldoen"
    ],
    scopes: [
      {
        id: "phones.read",
        label: "Telefoonnummers en toestemmingsstatus van klanten lezen"
      },
      {
        id: "sms.send",
        label: "Sms-berichten namens jou versturen"
      }
    ],
    install: {
      kind: "soon"
    }
  },
  {
    id: "zapier",
    name: "Zapier",
    tagline: "Koppel Insyte zonder code aan 5.000+ apps.",
    listing: "Automatisering",
    kind: "Koppeling",
    category: "ai",
    vendorUrl: "zapier.com",
    pricing: "Gratis · betaalde niveaus",
    features: [
      "Koppel Insyte zonder code aan 5.000+ apps",
      "Triggers voor bestellingen, tickets, chargebacks en klanten",
      "Zaps met meerdere stappen, ingebouwde vertraging en filter"
    ],
    scopes: [
      {
        id: "records.read",
        label: "Bestellingen, klanten, tickets en chargebacks lezen, met namen en e-mailadressen"
      },
      {
        id: "records.write",
        label: "Bestellingen, klanten, tickets en chargebacks wijzigen"
      }
    ],
    install: {
      kind: "key",
      areas: [
        "orders",
        "customers",
        "support",
        "chargebacks"
      ],
      write: false,
      expiresInDays: null
    }
  },
  {
    id: "googleads",
    name: "Google Ads",
    tagline: "Stuur LTV-signalen van klanten naar Google Ads voor slimmer bieden.",
    listing: "Advertenties",
    kind: "Koppeling",
    category: "marketing",
    vendorUrl: "ads.google.com",
    pricing: "Gratis",
    features: [
      "LTV-signalen van klanten naar Google Ads sturen",
      "Slim bieden op basis van echte margedata",
      "Doelgroepsynchronisatie voor retargeting en lookalikes"
    ],
    scopes: [
      {
        id: "ltv.read",
        label: "Samengevoegde bestel- en LTV-gegevens van klanten lezen"
      },
      {
        id: "audiences.send",
        label: "Doelgroeplijsten naar je Google Ads-account sturen"
      }
    ],
    install: {
      kind: "soon"
    }
  }
]

/** The connections Insyte makes itself (Instellingen → Koppelingen): already on, shown with their real marks (`ServiceLogo`). */
export type Own = {
  readonly id: string
  readonly name: string
  readonly what: string
  readonly detail: string
}
export const OWN: ReadonlyArray<Own> = [
  {
    id: "shopify",
    name: "Shopify",
    what: "Winkel",
    detail: "Northwind EU en Northwind US. Bestellingen, producten en klanten."
  },
  {
    id: "stripe",
    name: "Stripe",
    what: "Betalingen",
    detail: "Betalingen, terugbetalingen en chargebacks."
  },
  {
    id: "meta",
    name: "Meta Ads",
    what: "Advertenties",
    detail: "Advertentiekosten per dag, voor Kosten en de ROAS."
  },
  {
    id: "resend",
    name: "Resend",
    what: "E-mail",
    detail: "De mails die Insyte en de automatiseringen versturen."
  }
]

/** The shelves the editors keep, in their order (`COLLECTIONS.featured` in the original). */
export const FEATURED: ReadonlyArray<string> = ["klaviyo", "gorgias", "zapier", "aftership", "loop", "signifyd"]

export const FEEDBACK_CATEGORIES = [
  "Een app voorstellen",
  "Er werkt iets niet",
  "Een app-vermelding klopt niet",
  "Anders"
] as const

export const LEGAL = {
  voorwaarden: {
    label: "Voorwaarden",
    body: [
      "Apps in de Marketplace worden gebouwd en beheerd door hun aanbieders, niet door Insyte. Als je er een installeert, sluit je een overeenkomst met die aanbieder.",
      "De aanbieder factureert zelf, tenzij de vermelding zegt dat het via Insyte gaat. Insyte houdt niets in van wat je een aanbieder betaalt.",
      "Je kunt een app altijd verwijderen. De toegang stopt dan direct; data die al gekopieerd is, valt onder de voorwaarden van de aanbieder."
    ]
  },
  privacy: {
    label: "Privacy",
    body: [
      "Een app krijgt alleen de data die in zijn rechten staat. Je ziet en trekt die rechten in onder Instellingen, dan Apps.",
      "Insyte legt elk verzoek vast dat een app met zijn API-sleutel doet. Je ziet ze bij die sleutel onder Instellingen, dan API-sleutels.",
      "Insyte legt ook vast wie een app installeert, verwijdert of zijn rechten wijzigt. Dat wordt minstens 13 maanden bewaard.",
      "Klantdata verlaat via Insyte nooit je regio. Een aanbieder die data elders opslaat, vermeldt dat bij de app."
    ]
  },
  aanbieders: {
    label: "Aanbiedersprogramma",
    body: [
      "Elke app wordt beoordeeld voordat hij verschijnt: we vergelijken de gevraagde rechten met wat de app doet en testen hem in een dropshipping-werkruimte.",
      "Aanbieders beantwoorden supportvragen binnen twee werkdagen en melden een ingrijpende wijziging 30 dagen van tevoren.",
      "Bouw je iets voor dropshippers? Schrijf naar vendors@insyte.app met een korte omschrijving en een demowerkruimte."
    ]
  }
} as const
export type LegalTab = keyof typeof LEGAL

/**
 * What an installed app lets you set inside Insyte, opened in place: three switches per app, the
 * first two on. An app without its own list gets the general ones.
 */
const APP_SETTINGS: Readonly<Record<string, ReadonlyArray<string>>> = {
  klaviyo: [
    "Segmenten elk uur synchroniseren",
    "Nieuwe klanten meteen als profiel aanmaken",
    "Retourstatus als event sturen"
  ],
  recharge: [
    "Verlengingen in de bestellingenlijst tonen",
    "Mislukte betalingen als ticket",
    "Opzeggingen melden aan het team"
  ],
  gorgias: ["Oude tickets bij de klant tonen", "Macro's als antwoordsjabloon gebruiken", "Tags van Gorgias overnemen"],
  aftership: [
    "Track & trace-pagina in je huisstijl",
    "Vertraging na 48 uur als ticket",
    "Bezorgmeldingen naar de klant"
  ],
  zapier: ["Nieuwe bestellingen doorsturen", "Tickets naar Zapier sturen", "Fouten per e-mail melden"]
}
const GENERAL_SETTINGS = [
  "Nieuwe bestellingen automatisch synchroniseren",
  "Updates in de inbox plaatsen",
  "Klantlabels delen"
]
export const settingsOf = (id: string) => APP_SETTINGS[id] ?? GENERAL_SETTINGS
