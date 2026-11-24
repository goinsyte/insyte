import type { Route } from "../router.tsx"

/**
 * The explanation of a page, kept off the page (`page-guide.tsx`): a few short steps per page, in the
 * words of the current product's guides. A page without one here has no guide.
 */

type GuideStep = { readonly title: string; readonly body: string }
export type Guide = { readonly id: string; readonly title: string; readonly steps: ReadonlyArray<GuideStep> }

const GUIDES: Readonly<Record<string, Guide>> = {
  orders: {
    id: "orders.list",
    title: "Bestellingen",
    steps: [
      {
        title: "Al je bestellingen",
        body:
          "Bestellingen komen binnen een minuut na een winkelsynchronisatie binnen, met artikelen, klant en leverancier al gekoppeld."
      },
      {
        title: "Labels",
        body:
          "Labels zijn van jou, om op te sorteren en te filteren. Vertraagd en Track & trace verstuurd zet Insyte zelf."
      }
    ]
  },
  customers: {
    id: "customers.list",
    title: "Klanten",
    steps: [
      {
        title: "Al je klanten",
        body:
          "Elke klant die bij een gekoppelde winkel bestelde, staat hier, met bestellingen, tickets en chargebacks al gekoppeld."
      },
      {
        title: "Dubbele profielen",
        body: "Hetzelfde e-mailadres, of dezelfde naam in hetzelfde land. Er wordt niets samengevoegd tot jij dat zegt."
      },
      { title: "Labels", body: "Labels gaan mee met het profiel, naar segmenten, automatiseringen en Klaviyo." }
    ]
  },
  inbox: {
    id: "inbox",
    title: "Inbox",
    steps: [
      {
        title: "Alles op één plek",
        body:
          "Je support-mailbox, Gmail of Outlook. Insyte leest mee, deelt in naar soort en koppelt aan de bestelling of het ticket."
      },
      {
        title: "WhatsApp en Instagram",
        body: "Antwoorden kan binnen het venster van 24 uur. Daarna op WhatsApp alleen met een goedgekeurd sjabloon."
      },
      {
        title: "Websitechat",
        body:
          "De klantagent kan er zelf antwoorden, binnen jouw regels. Wat hij overdraagt, neem je over of geef je terug."
      }
    ]
  },
  returns: {
    id: "returns",
    title: "Retouren",
    steps: [
      {
        title: "Aanvragen uit het portaal",
        body:
          "Klanten zoeken hun bestelling op en kiezen een reden en een oplossing. Hier staat het met de reden, de foto's en wat de klant wil."
      },
      {
        title: "Zelf een retour starten",
        body:
          "Vanaf de bestelling, als een klant belt of mailt. Hij komt bij Te beoordelen, net als een aanvraag uit het portaal."
      }
    ]
  },
  chargeback: {
    id: "chargebacks.case",
    title: "Chargeback",
    steps: [
      {
        title: "Bewijs verzamelen",
        body:
          "Insyte stelt het pakket samen: de scan van de vervoerder, de bezorgfoto, de antwoorden van de klant en de originele factuur."
      },
      {
        title: "Controleren en indienen",
        body: "Controleer wat is toegevoegd en dien het dan in. Er gaat niets naar de aanbieder tot je dat doet."
      },
      { title: "De uitspraak", body: "De uitspraak komt meestal binnen 30 dagen. Insyte houdt het in de gaten." }
    ]
  },
  automations: {
    id: "automations.list",
    title: "Automatiseringen",
    steps: [
      {
        title: "Wat een automatisering doet",
        body:
          "Ze let op iets, zoals een bestelling die te laat is of een geschil dat opent, en doet dan de volgende stappen voor je."
      },
      {
        title: "Begin met een sjabloon",
        body:
          "Een sjabloon maakt een concept dat je aanpast. Of beschrijf in één zin wat je wilt. Niets gaat vanzelf aan."
      }
    ]
  },
  affiliates: {
    id: "affiliates",
    title: "Affiliates",
    steps: [
      {
        title: "Affiliates",
        body: "Mensen die al over je producten praten. Ze verdienen een percentage van elke bestelling via hun code."
      },
      {
        title: "Aanmeldingen",
        body:
          "Wie zich aanmeldt voor het partnerprogramma staat hier met kanaal, bereik en waarom, tot je goedkeurt of afwijst."
      },
      { title: "Uitbetalingen", body: "Commissie staat hier per maand, klaar om goed te keuren na de retourtermijn." }
    ]
  },
  costs: {
    id: "costs",
    title: "Kosten",
    steps: [{
      title: "Van omzet naar nettowinst",
      body: "Vul in wat de winkel per maand kost. Analyse en Sheets rekenen er de nettowinst en de ROAS mee uit."
    }]
  },
  sheets: {
    id: "sheets",
    title: "Sheets",
    steps: [
      {
        title: "Rekenen op je eigen cijfers",
        body:
          "Een cel kan een cijfer uit Insyte lezen: omzet, advertenties, nettowinst. Het is hetzelfde getal als in Analyse en het blijft bij."
      },
      {
        title: "Formules zoals je ze kent",
        body: "=SOM, =GEMIDDELDE, =ALS, met een puntkomma tussen de delen. Gaat er iets mis, dan staat erbij waarom."
      }
    ]
  },
  courses: {
    id: "courses",
    title: "Cursussen",
    steps: [
      {
        title: "Hoofdstukken, modules, cursussen",
        body: "Een hoofdstuk is een onderwerp, een module een stuk ervan. Sleep cursussen om de volgorde te kiezen."
      },
      {
        title: "Wie wat moet volgen",
        body:
          "Per cursus kies je het team, bepaalde rollen of leveranciers, en een deadline. Onder Team zie je wie klaar is."
      }
    ]
  },
  live: {
    id: "live",
    title: "Live",
    steps: [{
      title: "Wie er nu op je winkel is",
      body:
        "Elke stip is een bezoeker. Zie waar ze vandaan komen, wat ze bekijken en wie er afrekent, terwijl het gebeurt."
    }]
  },
  analytics: {
    id: "analytics",
    title: "Analyse",
    steps: [
      {
        title: "Wat Insyte leest",
        body:
          "Analyse leest je bestellingen, leveringen, terugbetalingen en tickets, en schrijft wat er veranderde en waarom."
      },
      { title: "Vraag ernaar", body: "Antwoorden komen uit dezelfde regels en verschijnen naast je werk." }
    ]
  },
  team: {
    id: "settings.team",
    title: "Team",
    steps: [
      {
        title: "Plekken op je abonnement",
        body: "De plekken bepalen of je iemand kunt uitnodigen. Zijn ze allemaal bezet, dan koop je er hier een bij."
      },
      {
        title: "Uitnodigen via link",
        body: "Eén link voor je hele team om door te sturen. Wie hem gebruikt, komt binnen met de rol die je kiest."
      }
    ]
  }
}

/** The guide for a page, if it has one: an area's first page, a chargeback, Live, a board, Team. */
export function guideFor(route: Route): Guide | null {
  if (route.name === "live") return GUIDES.live ?? null
  if (route.name === "board") return GUIDES.analytics ?? null
  if (route.name !== "area") return null
  const [first] = route.path
  if (route.area === "chargebacks") return first === undefined ? null : GUIDES.chargeback ?? null
  if (route.area === "settings") return route.base === "instellingen" && first === "team" ? GUIDES.team ?? null : null
  if (route.area === "inbox") return route.base === "inbox" && first === undefined ? GUIDES.inbox ?? null : null
  if (first !== undefined) return null
  return GUIDES[route.area] ?? null
}
