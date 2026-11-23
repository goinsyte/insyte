import { DEMO_NOW, PEOPLE, STORES } from "./workspace.ts"

/*
 * The demo data of the screens outside the product: signing in, an invitation link in each state it
 * can be in, and the setup flow per persona. Rebuilt from the current demo (`lib/invitations.ts`,
 * `onboarding/*`, `mock-data/first-analysis.ts`) on version 2's clock (Monday 23 November 2026,
 * 14:30) and in euros. Every name is fictional; no credential is ever kept.
 */

const DAY = 86_400_000
const NOW = DEMO_NOW.date.getTime()

/** The workspace an invitation is for, as the landing names it. */
export const WORKSPACE_FULL = "Northwind Clothing Co."

/** Whoever is signed in on this browser, for the "wrong account" state. */
export const SIGNED_IN_AS = { name: PEOPLE.elena.name, email: "elena@northwindclothing.co" } as const

export const SUPPORT_EMAIL = "support@goinsyte.com"

/* ── roles, as the invitation describes them ───────────────────────────────────────────────────── */

export type RoleId = "service" | "finance" | "admin" | "view"

/** The role's label and what it may do, in the roles matrix's own sentences. */
export const ROLES: Readonly<Record<RoleId, { readonly label: string; readonly abilities: ReadonlyArray<string> }>> = {
  service: {
    label: "Klantenservice",
    abilities: [
      "Beheert klantenservice.",
      "Kan bestellingen bewerken, labelen en annuleren, retouren behandelen, labels versturen en ontvangst melden, klanten bewerken en labelen en bewijspakketten opstellen.",
      "Ziet producten, leveranciers, automatiseringen, team en rollen en cursussen, maar wijzigt daar niets.",
      "Ziet affiliates, analyse, data en export, instellingen, facturatie en koppelingen en API niet.",
      "Mag terugbetalen tot € 100 per bestelling.",
      "Mag ook: chargeback-bewijs indienen en retouren goedkeuren."
    ]
  },
  finance: {
    label: "Financiën",
    abilities: [
      "Beheert chargebacks en facturatie.",
      "Kan bestellingen bewerken, labelen en annuleren en aanmeldingen beoordelen en affiliates bijwerken.",
      "Ziet retouren, klanten, producten, leveranciers, analyse, data en export, team en rollen en cursussen, maar wijzigt daar niets.",
      "Ziet klantenservice, automatiseringen, instellingen en koppelingen en API niet.",
      "Mag terugbetalen zonder limiet.",
      "Mag ook: chargeback-bewijs indienen, exporteren, facturen bekijken en kosten bewerken."
    ]
  },
  admin: {
    label: "Beheerder",
    abilities: [
      "Beheert bestellingen, retouren, klanten, producten, klantenservice, chargebacks, leveranciers, affiliates, automatiseringen, data en export, instellingen, team en rollen, koppelingen en API en cursussen.",
      "Ziet analyse en facturatie, maar wijzigt daar niets.",
      "Mag terugbetalen zonder limiet.",
      "Mag ook: chargeback-bewijs indienen, exporteren, klanten samenvoegen, automatiseringen publiceren, facturen bekijken, retouren goedkeuren, kwaliteit goedkeuren, productfase wijzigen, zelfstandigheid van Insyte instellen en kosten bewerken."
    ]
  },
  view: {
    label: "Alleen lezen",
    abilities: [
      "Ziet bestellingen, retouren, klanten, producten, klantenservice, chargebacks, leveranciers, affiliates, automatiseringen, analyse, data en export, instellingen, team en rollen, koppelingen en API en cursussen, maar wijzigt daar niets.",
      "Ziet facturatie niet."
    ]
  }
}

/** What a supplier sees in the portal, the scopes an invitation grants. */
export const PORTAL_SCOPES: ReadonlyArray<{ readonly id: string; readonly label: string; readonly detail: string }> = [
  {
    id: "orders",
    label: "Bestellingen met hun producten",
    detail: "Hun regels, de kostprijs en het verzendadres. Nooit het e-mailadres of telefoonnummer van de klant."
  },
  { id: "stock", label: "Voorraad en levertijd bijwerken", detail: "Wat ze opgeven zie je terug op de productpagina." },
  { id: "statements", label: "Afrekeningen", detail: "Wat Northwind per maand voor hun regels betaalt." },
  { id: "chat", label: "Chat met jullie team", detail: "Eén gedeeld kanaal, zichtbaar aan beide kanten." },
  {
    id: "media",
    label: "Productfoto's en video's aanleveren",
    detail: "Ze verschijnen bij het product als aangeleverd door de leverancier."
  }
]

/* ── invitations ───────────────────────────────────────────────────────────────────────────────── */

export type InvitationState =
  | "new"
  | "existing"
  | "other-account"
  | "link"
  | "sso"
  | "full"
  | "expired"
  | "revoked"
  | "accepted"
  | "supplier"
  | "affiliate"
  | "missing"

export type Invitation = {
  readonly id: string
  readonly state: InvitationState
  readonly workspace: string
  readonly inviter: { readonly name: string; readonly role: string; readonly email: string }
  readonly email?: string
  readonly name?: string
  readonly roleId?: RoleId
  /** "all", or the store ids it covers. */
  readonly stores: "all" | ReadonlyArray<string>
  readonly message?: string
  /** When it lapses (or lapsed, or was accepted). */
  readonly at?: Date
  /** A supplier invitation: the company. */
  readonly company?: string
  /** An affiliate invitation: the tier and the code it starts with. */
  readonly tier?: { readonly label: string; readonly rate: number }
  readonly code?: string
}

const elena = { name: PEOPLE.elena.name, role: "Eigenaar", email: "elena@northwindclothing.co" }
const sofia = { name: PEOPLE.sofia.name, role: "CX-lead", email: "sofia@northwindclothing.co" }
const ethan = { name: PEOPLE.ethan.name, role: "Teamlid", email: "ethan@northwindclothing.co" }
const maya = { name: PEOPLE.maya.name, role: "Teamlid", email: "maya@northwindclothing.co" }

/** The designed states, each under the id the Demoweergave dialog links to. */
export const INVITATIONS: ReadonlyArray<Invitation> = [
  {
    id: "nieuw",
    state: "new",
    workspace: WORKSPACE_FULL,
    inviter: sofia,
    email: "amber@northwindclothing.co",
    name: "Amber Lewis",
    roleId: "service",
    stores: ["store_us", "store_eu"],
    message: "Begin met de tickets die aan jou zijn toegewezen, Sofía loopt de eerste week met je mee.",
    at: new Date(NOW + 5 * DAY)
  },
  {
    id: "bestaand",
    state: "existing",
    workspace: WORKSPACE_FULL,
    inviter: elena,
    email: "ruben@hartco.agency",
    name: "Ruben Smit",
    roleId: "finance",
    stores: "all",
    at: new Date(NOW + 6 * DAY)
  },
  {
    id: "ander-account",
    state: "other-account",
    workspace: "Kestrel Goods",
    inviter: { name: "Noor Visser", role: "Eigenaar", email: "noor@kestrelgoods.co" },
    email: "elena.hart@gmail.com",
    name: "Elena Hart",
    roleId: "admin",
    stores: "all",
    message: "Wil je meekijken naar onze supportwachtrij? Je weet hoe Northwind het doet.",
    at: new Date(NOW + 6 * DAY)
  },
  {
    id: "link-nw7k2q9d",
    state: "link",
    workspace: WORKSPACE_FULL,
    inviter: elena,
    roleId: "service",
    stores: "all",
    at: new Date(NOW + 7 * DAY)
  },
  {
    id: "sso",
    state: "sso",
    workspace: WORKSPACE_FULL,
    inviter: elena,
    email: "noah@northwindclothing.co",
    name: "Noah Bakker",
    roleId: "service",
    stores: "all",
    at: new Date(NOW + 6 * DAY)
  },
  {
    id: "vol",
    state: "full",
    workspace: WORKSPACE_FULL,
    inviter: ethan,
    email: "lotte@northwindclothing.co",
    name: "Lotte de Graaf",
    roleId: "view",
    stores: "all",
    at: new Date(NOW + 4 * DAY)
  },
  {
    id: "verlopen",
    state: "expired",
    workspace: WORKSPACE_FULL,
    inviter: elena,
    email: "jonas.vermeulen@northwindclothing.co",
    roleId: "finance",
    stores: "all",
    at: new Date(NOW - 3 * DAY)
  },
  {
    id: "ingetrokken",
    state: "revoked",
    workspace: WORKSPACE_FULL,
    inviter: elena,
    email: "tess@northwindclothing.co",
    roleId: "view",
    stores: "all",
    at: new Date(NOW - DAY)
  },
  {
    id: "geaccepteerd",
    state: "accepted",
    workspace: WORKSPACE_FULL,
    inviter: elena,
    email: "maya@northwindclothing.co",
    name: "Maya Roy",
    roleId: "view",
    stores: ["store_eu"],
    at: new Date(2025, 3, 7, 11, 0)
  },
  {
    id: "leverancier",
    state: "supplier",
    workspace: WORKSPACE_FULL,
    inviter: elena,
    email: "studio@blackcedar.co",
    company: "Black Cedar Studio",
    stores: "all",
    message:
      "We willen jullie leren in het najaar opnemen. Via het portaal zie je meteen welke bestellingen voor jullie zijn.",
    at: new Date(NOW + 4 * DAY)
  },
  {
    id: "affiliate",
    state: "affiliate",
    workspace: WORKSPACE_FULL,
    inviter: maya,
    email: "femke@kijkfemke.nl",
    name: "Femke Jansen",
    tier: { label: "Zilver", rate: 12 },
    code: "FEMKE",
    stores: "all",
    message: "Je reviews van onze fleece deden het goed. We starten je op Zilver.",
    at: new Date(NOW + 13 * DAY)
  }
]

/** The seats on Northwind's plan, all taken in the full state. */
export const SEATS_TOTAL = 12

/** The invitation a link opens on; an id nobody made is a link that does not exist. */
export function invitation(id: string): Invitation {
  return INVITATIONS.find((i) => i.id === id) ??
    { id, state: "missing", workspace: WORKSPACE_FULL, inviter: elena, stores: "all" }
}

/** "Alle winkels", or the stores by name. */
export function storesLabel(stores: Invitation["stores"]): string {
  if (stores === "all") return "Alle winkels"
  const names = stores.map((id) => STORES.find((s) => s.id === id)?.name).filter((n) => n !== undefined)
  return names.length === 0 ? "Geen winkels" : names.join(", ")
}

/** "over 5 dagen", "3 dagen geleden", "morgen": a date against the demo's now. */
export function relative(at: Date): string {
  const days = Math.round((at.getTime() - NOW) / DAY)
  if (days === 0) return "vandaag"
  if (days === 1) return "morgen"
  if (days === -1) return "gisteren"
  return days > 0 ? `over ${days} dagen` : `${-days} dagen geleden`
}

/** "7 april 2025". */
export const longDate = (at: Date) => at.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })

/** The notifications a new teammate chooses in the last step of joining. */
export const NOTIFY: ReadonlyArray<
  { readonly id: string; readonly label: string; readonly detail: string; readonly on: boolean }
> = [
  {
    id: "assigned",
    label: "Aan mij toegewezen",
    detail: "Een ticket, bestelling of chargeback die van jou is",
    on: true
  },
  { id: "mentions", label: "Vermeldingen", detail: "Iemand noemt je in een chat of reactie", on: true },
  {
    id: "deadlines",
    label: "Deadlines die naderen",
    detail: "Bewijs voor een chargeback, een te late leverancier",
    on: true
  },
  { id: "digest", label: "Samenvatting om 8:00", detail: "Wat er gisteren gebeurde en wat vandaag wacht", on: false }
]

/* ── signing in ────────────────────────────────────────────────────────────────────────────────── */

/**
 * The demo's server answers. Any well-formed address and any password sign in, so the flow can be
 * shown; these two show the refusals the screens are designed for.
 */
export const DEMO_REFUSALS = {
  /** Signing in with this password answers "E-mailadres of wachtwoord klopt niet". */
  wrongPassword: "fout",
  /** This code answers "Deze code klopt niet". */
  wrongCode: "000000",
  /** Making an account with this address answers that Insyte is invite only. */
  notInvited: "geen-uitnodiging@northwind.co"
} as const

export const AUTH_ERRORS = {
  invalidLogin: "E-mailadres of wachtwoord klopt niet.",
  invalidCode: "Deze code klopt niet. Controleer de tijd op je telefoon en probeer de volgende code.",
  invalidBackup: "Deze back-upcode klopt niet of is al gebruikt.",
  betaClosed: "Insyte is nog alleen op uitnodiging. Laat je e-mailadres achter, dan laten we het je weten.",
  notVerified: "Je e-mailadres is nog niet bevestigd. Klik op de link in de mail en kom dan terug."
} as const

/* ── setting up ────────────────────────────────────────────────────────────────────────────────── */

export type Persona = "admin" | "supplier" | "affiliate"

/** The URL's word for a persona, and back. */
export const PERSONA_SLUG: Readonly<Record<Persona, "merk" | "leverancier" | "affiliate">> = {
  admin: "merk",
  supplier: "leverancier",
  affiliate: "affiliate"
}

export const PERSONA_LABEL: Readonly<Record<Persona, string>> = {
  admin: "Winkeleigenaar",
  supplier: "Leverancier",
  affiliate: "Affiliate"
}

export const ROLE_OPTIONS: ReadonlyArray<
  { readonly id: Persona; readonly label: string; readonly hint: string; readonly meta: string }
> = [
  {
    id: "admin",
    label: "Mijn winkel inrichten",
    hint: "Shopify, je team en je wachtrij, alles op één plek.",
    meta: "nog ~7 min · 7 stappen"
  },
  {
    id: "supplier",
    label: "Ik ben leverancier",
    hint: "Toon je actuele voorraad, accepteer bestellingen en word netjes uitbetaald.",
    meta: "nog ~3 min · 4 stappen"
  },
  {
    id: "affiliate",
    label: "Aanmelden als affiliate",
    hint: "Stuur je publiek hierheen. Verdien als ze kopen.",
    meta: "nog ~2 min · 2 stappen"
  }
]

/** What the brand half says at each step: why the question is worth answering. */
export type BrandLine = { readonly lead: string; readonly rest: string; readonly body: string }

const BOOKEND: BrandLine = {
  lead: "Standaard stil.",
  rest: "Luid als het ertoe doet.",
  body:
    "Het besturingssysteem voor dropshippers. Bestellingen, klantenservice, leveranciers, chargebacks en automatiseringen in één commandocentrum."
}

export const LOGIN_LINE = BOOKEND

const HEAD: Readonly<Record<string, BrandLine>> = {
  account: BOOKEND,
  verify: {
    lead: "Eén link,",
    rest: "dan ben je binnen.",
    body:
      "Door hem te openen bevestig je dat het adres van jou is. Het is de enige e-mail die we sturen voordat je bent ingericht."
  },
  role: {
    lead: "Drie manieren.",
    rest: "Kies jouw kant van de bestelling.",
    body:
      "Winkeleigenaren runnen hier hun zaak, leveranciers verwerken de bestellingen, affiliates brengen de kopers. Je kunt later wisselen in de instellingen."
  }
}

const TAILS: Readonly<Record<Persona, Readonly<Record<string, BrandLine>>>> = {
  admin: {
    organization: {
      lead: "Eén werkruimte",
      rest: "voor de hele winkel.",
      body: "Je team, je winkels en elke bestelling op één plek. De naam en de URL kun je altijd wijzigen."
    },
    plan: {
      lead: "Veertien dagen",
      rest: "gratis.",
      body: "Geen kaart nodig om te starten. Kies wat nu past en schakel op of af via facturatie wanneer je wilt."
    },
    store: {
      lead: "Shopify blijft",
      rest: "de bron van waarheid.",
      body:
        "Insyte leest bestellingen, producten en klanten uit je winkel. Je trekt de toegang altijd in via Shopify-beheer."
    },
    sync: {
      lead: "Elke bestelling,",
      rest: "één wachtrij.",
      body:
        "De eerste import staat er binnen seconden. Daarna houdt Insyte alles gesynchroniseerd, zodat de wachtrij altijd van vandaag is."
    },
    analysis: {
      lead: "Eerst kijken,",
      rest: "dan één ding.",
      body:
        "Insyte leest je winkel zoals een nieuwe compagnon op zijn eerste dag: het zoekt het grootste knelpunt en zet de aanpak alvast klaar. Bij te weinig data zegt het dat eerlijk."
    },
    offline: {
      lead: "Ook als jij",
      rest: "slaapt.",
      body: "Insyte werkt door binnen de grenzen die jij zet. Wat het niet zelf mag, staat 's ochtends voor je klaar."
    },
    ready: {
      ...BOOKEND,
      body: "Elke ochtend zet Insyte de drie of vier dingen die jou nodig hebben bovenaan, en houdt de rest uit beeld."
    }
  },
  supplier: {
    profile: {
      lead: "Jij regelt de voorraad.",
      rest: "Insyte regelt de rest.",
      body:
        "Klanten zien je bedrijf op pakbonnen en in correspondentie over terugbetalingen, dus kies een naam die ze herkennen."
    },
    api: {
      lead: "Bestellingen komen binnen",
      rest: "zonder spreadsheet.",
      body:
        "Koppel het platform dat je al gebruikt, of sla het over. Maatwerkkoppelingen richten we één op één met je in."
    },
    stock: {
      lead: "Echte voorraad",
      rest: "verkoopt.",
      body: "Kies hoe je doorgeeft wat er op de plank ligt. Je kunt altijd van modus wisselen."
    },
    ready: {
      ...BOOKEND,
      body:
        "Je leveranciersdashboard is live. Bestellingen die aan jou zijn toegewezen komen daar binnen, en we mailen je zodra de eerste er is."
    }
  },
  affiliate: {
    profile: {
      lead: "Stuur je publiek door.",
      rest: "Verdien als ze kopen.",
      body: "Vertel ons wie je bereikt en waar. Hoe specifieker je bent, hoe sneller we je kunnen goedkeuren."
    },
    review: {
      lead: "Gelezen door een mens,",
      rest: "geen filter.",
      body: "We beoordelen elke affiliate met de hand. Je hoort binnen twee werkdagen een besluit."
    }
  }
}

export function brandLine(persona: Persona | null, stepId: string): BrandLine {
  return (persona === null ? undefined : TAILS[persona][stepId]) ?? HEAD[stepId] ?? BOOKEND
}

export const COUNTRIES = [
  "Nederland",
  "België",
  "Duitsland",
  "Frankrijk",
  "Verenigd Koninkrijk",
  "Verenigde Staten",
  "Italië",
  "Spanje"
] as const

export const TEAM_SIZES: ReadonlyArray<{ readonly id: string; readonly label: string; readonly hint: string }> = [
  { id: "solo", label: "Alleen ik", hint: "Solo-ondernemer" },
  { id: "small", label: "2 tot 5", hint: "Klein team" },
  { id: "mid", label: "6 tot 20", hint: "Groeiend team" },
  { id: "large", label: "Meer dan 20", hint: "Meerdere winkels" }
]

export type PlanId = "starter" | "growth" | "scale"

export const PLANS: ReadonlyArray<
  {
    readonly id: PlanId
    readonly name: string
    readonly monthly: number
    readonly annual: number
    readonly tagline: string
  }
> = [
  { id: "starter", name: "Starter", monthly: 99, annual: 89, tagline: "Solo-oprichters, 1 winkel, 3 gebruikers." },
  {
    id: "growth",
    name: "Growth",
    monthly: 249,
    annual: 219,
    tagline: "3 winkels, 10 gebruikers, Klarna- en PayPal-geschillen."
  },
  {
    id: "scale",
    name: "Scale",
    monthly: 499,
    annual: 449,
    tagline: "Meer dan 1.000 bestellingen per week, onbeperkt winkels en gebruikers."
  }
]

/* The first analysis: what Insyte says straight after the store is connected. */

export type PreparedId = "automation" | "agent" | "sheet"

export const PREPARED: Readonly<Record<PreparedId, { readonly title: string; readonly does: string }>> = {
  automation: {
    title: "Levertijd-update op dag 5",
    does: "Op dag 5 de trackinglink en de verwachte datum naar de klant."
  },
  agent: {
    title: "Antwoorden op statusvragen",
    does: "Schrijft het antwoord met de actuele status, jij keurt het goed."
  },
  sheet: { title: "Levertijd per land", does: "Wat je belooft naast wat het werkelijk duurt, per land." }
}

export const PREPARED_KIND: Readonly<Record<PreparedId, string>> = {
  automation: "Concept",
  agent: "Eerst vragen",
  sheet: "Rekenblad"
}

export const READS: ReadonlyArray<string> = [
  "Bestellingen en verzendingen",
  "Klantmails in de inbox",
  "Productpagina's en wat ze beloven",
  "Verzend- en retourbeleid"
]

export type Evidence = { readonly figure: string; readonly says: string; readonly basis: string }
export type Finding = {
  readonly headline: string
  readonly evidence: ReadonlyArray<Evidence>
  readonly fix: { readonly title: string; readonly why: string }
  readonly effect: { readonly figure: string; readonly basis: string }
}
export type Prediction = { readonly read: string; readonly expect: string }
export type Watch = { readonly label: string; readonly after: string; readonly have: number; readonly need: number }

export type AnalysisSeed = {
  readonly store: {
    readonly products: number
    readonly customers: number
    readonly orders: number
    readonly mails: number
    readonly days: number
  }
  readonly finding?: Finding
  readonly early?: { readonly predictions: ReadonlyArray<Prediction>; readonly watch: ReadonlyArray<Watch> }
}

const FIX = {
  title: "Laat de klant niet wachten tot hij gaat vragen.",
  why:
    "Stuur op dag 5 zelf de trackinglink en de verwachte datum. Dit is de vaste aanpak bij levertijden boven een week: de meeste van deze mails vragen niets anders."
}

/**
 * Three stores the analysis can read, picked by the demo's state: the first day (a store three weeks
 * old with 14 orders, so Insyte does not judge), the normal Monday, and the busy week.
 */
export const ANALYSIS: Readonly<Record<"first" | "settled" | "busy", AnalysisSeed>> = {
  first: {
    store: { products: 36, customers: 11, orders: 14, mails: 9, days: 19 },
    early: {
      predictions: [
        {
          read: "7 tot 12 werkdagen levertijd",
          expect:
            "Bij levertijden boven een week worden vragen over de status meestal de grootste stroom mail. Een update voordat de klant gaat vragen staat klaar."
        },
        {
          read: "Klarna als betaalmethode",
          expect:
            "Een Klarna-geschil heeft een vaste reactietermijn. Insyte zet bewijs per bestelling klaar zodra er een binnenkomt, zodat je die termijn haalt."
        },
        {
          read: "Retourbeleid zonder regel voor beschadigde artikelen",
          expect: "Een klacht over schade valt nu tussen wal en schip. Insyte vraagt je bij de eerste om een regel."
        }
      ],
      watch: [
        { label: "Levertijd per land", after: "dan zie je waar je belofte niet klopt", have: 6, need: 30 },
        { label: "Vragen per product", after: "dan weet Insyte welke pagina antwoord mist", have: 9, need: 50 },
        { label: "Retourredenen", after: "dan zie je welk product terugkomt en waarom", have: 0, need: 10 }
      ]
    }
  },
  settled: {
    store: { products: 248, customers: 1912, orders: 3406, mails: 1288, days: 90 },
    finding: {
      headline: "Een derde van je klantmail is “waar is mijn bestelling?”.",
      evidence: [
        {
          figure: "412 van 1.288",
          says: "mails in 90 dagen gaan over de status van een bestelling",
          basis: "Inbox, laatste 90 dagen"
        },
        {
          figure: "9,4 dagen",
          says: "duurt een bestelling naar de VS, je productpagina's beloven 5 tot 7",
          basis: "238 bezorgde zendingen naar de VS"
        },
        {
          figure: "71%",
          says: "van die mails komt binnen op dag 6 tot 10, voordat het pakket er is",
          basis: "Moment van de mail naast de bezorgdatum"
        }
      ],
      fix: FIX,
      effect: {
        figure: "~290 mails minder per kwartaal",
        basis: "71% van 412, als die klanten de update op tijd krijgen"
      }
    }
  },
  busy: {
    store: { products: 1124, customers: 18_240, orders: 31_870, mails: 11_406, days: 90 },
    finding: {
      headline: "Een derde van je klantmail is “waar is mijn bestelling?”.",
      evidence: [
        {
          figure: "3.902 van 11.406",
          says: "mails in 90 dagen gaan over de status van een bestelling",
          basis: "Inbox, laatste 90 dagen, drie winkels"
        },
        {
          figure: "10,1 dagen",
          says: "duurt een bestelling naar de VS, je productpagina's beloven 5 tot 7",
          basis: "2.114 bezorgde zendingen naar de VS"
        },
        {
          figure: "68%",
          says: "van die mails komt binnen op dag 6 tot 10, voordat het pakket er is",
          basis: "Moment van de mail naast de bezorgdatum"
        }
      ],
      fix: FIX,
      effect: {
        figure: "~2.650 mails minder per kwartaal",
        basis: "68% van 3.902, als die klanten de update op tijd krijgen"
      }
    }
  }
}

/** Asked whenever there is no finding, so the right things are prepared before the data is. */
export const QUESTIONS: ReadonlyArray<
  {
    readonly id: string
    readonly ask: string
    readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>
    readonly initial: string
  }
> = [
  {
    id: "fulfilment",
    ask: "Wie verstuurt je bestellingen?",
    options: [
      { value: "one", label: "Eén leverancier" },
      { value: "many", label: "Meerdere" },
      { value: "self", label: "Ik zelf" }
    ],
    initial: "one"
  },
  {
    id: "reply",
    ask: "Mag Insyte statusvragen zelf beantwoorden?",
    options: [{ value: "ask", label: "Eerst aan mij vragen" }, { value: "auto", label: "Ja, zelf doen" }],
    initial: "ask"
  }
]

export type OfflineLevel = "auto" | "ask"

/** What Insyte may do while nobody is online; a locked row always asks. */
export const OFFLINE_ACTIONS: ReadonlyArray<
  { readonly id: string; readonly night: string; readonly locked?: string; readonly initial: OfflineLevel }
> = [
  { id: "ForwardOrder", night: "Betaalde bestellingen doorsturen naar de leverancier", initial: "auto" },
  { id: "ApplyLabel", night: "Nieuwe mail labelen en in de goede wachtrij zetten", initial: "auto" },
  { id: "SendReply", night: "Klanten antwoorden op vragen over hun bestelling", initial: "ask" },
  { id: "ApproveReturn", night: "Retouren goedkeuren die aan je beleid voldoen", initial: "ask" },
  {
    id: "RefundOrder",
    night: "Terugbetalingen",
    locked: "Terugbetalingen vragen altijd, tot er een grens per bedrag is",
    initial: "ask"
  }
]

export const OFFLINE_WINDOWS: ReadonlyArray<{ readonly id: string; readonly label: string; readonly hint: string }> = [
  { id: "evening", label: "Na 18:00 en in het weekend", hint: "De meeste winkels" },
  { id: "late", label: "Na 22:00", hint: "Avonden werk je door" },
  { id: "shifts", label: "Wisselend", hint: "Insyte kijkt wie er online is" }
]

export const SUPPLIER_PLATFORMS = [
  "Geen, we richten het samen in",
  "AliExpress",
  "CJ Dropshipping",
  "Spocket",
  "Modalyst",
  "Eigen API"
] as const

export const STOCK_OPTIONS: ReadonlyArray<{ readonly id: string; readonly title: string; readonly body: string }> = [
  { id: "live", title: "Live voorraadfeed", body: "We vragen je API elke 5 minuten op." },
  {
    id: "indicator",
    title: "Alleen indicatie (hoog / gemiddeld / laag)",
    body: "Jij geeft een ruwe indicatie. Wij vullen aan op basis van het besteltempo."
  },
  { id: "manual", title: "Handmatige updates", body: "Je werkt de voorraad met de hand bij vanaf je dashboard." }
]

export const AFFILIATE_COUNTRIES = [
  "Nederland",
  "België",
  "Duitsland",
  "Frankrijk",
  "Verenigd Koninkrijk",
  "Verenigde Staten",
  "Canada",
  "Italië",
  "Spanje",
  "Australië",
  "Anders"
] as const

export const PAYOUTS = ["Stripe Connect", "PayPal", "Bankoverschrijving"] as const
