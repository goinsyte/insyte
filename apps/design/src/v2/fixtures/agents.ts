import type { ComponentType } from "react"
import { At, CreditCard, Factory, Inbox, MessageSquare, Package, Returns, Truck, Zap } from "../ui/icons.tsx"

/**
 * The workspace's agents. Each is a colleague with a job: instructions, the skills it may use, the
 * triggers that start it, and what it may do on its own (PRODUCT.md: _Zelf doen_, _Eerst vragen_,
 * _Nooit_). "Uren bespaard" is computed, never typed: runs × the minutes a person would have spent.
 */

export type Glyph = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

export type Autonomy = "zelf" | "vragen" | "nooit"

export type Agent = {
  readonly id: string
  readonly name: string
  readonly purpose: string
  readonly glyph: Glyph
  readonly active: boolean
  readonly works: string
  readonly runs: number
  readonly runsToday: number
  /** What one run saves a person, in minutes (the basis of "uren bespaard"). */
  readonly minutesPerRun: number
  readonly lastWorked: string
  readonly managers: string
  readonly instructions?: {
    readonly role: string
    readonly does: ReadonlyArray<string>
    readonly handover: ReadonlyArray<string>
  }
  readonly skills?: ReadonlyArray<{ readonly name: string; readonly detail: string; readonly glyph: Glyph }>
  readonly triggers?: ReadonlyArray<
    { readonly id: string; readonly name: string; readonly detail: string; readonly glyph: Glyph; readonly on: boolean }
  >
  readonly permissions?: ReadonlyArray<Permission>
  readonly log?: ReadonlyArray<LogEntry>
  readonly chat?: ReadonlyArray<{ readonly from: "agent" | "me"; readonly at: string; readonly text: string }>
}

/**
 * One action the agent can take and how free it is. `standard` is the safe setting it ships with;
 * `risk` is set when the action costs money or speaks for the business: raising it to "zelf" then
 * asks first and says what changes.
 */
export type Permission = {
  readonly id: string
  readonly action: string
  readonly setting: Autonomy
  readonly standard: Autonomy
  readonly risk?: string
  readonly locked?: boolean
}

/**
 * One line in the agent's record. `undo` says what is still possible: "kan" can be taken back,
 * "verstuurd" reached a customer and cannot. No `undo`: nothing was done (a proposal, a question).
 */
export type LogEntry = {
  readonly id: string
  readonly at: string
  readonly text: string
  readonly record: string
  readonly setting: Autonomy
  readonly undo?: "kan" | "verstuurd"
  /** A change to the agent's rules, by a person, rather than work the agent did. */
  readonly rule?: { readonly permission: string; readonly from: Autonomy }
}

export const AGENTS: ReadonlyArray<Agent> = [
  {
    id: "waar-is-mijn-bestelling",
    name: "Waar is mijn bestelling",
    purpose: "Beantwoordt vragen over track & trace in de inbox",
    glyph: Truck,
    active: true,
    works: "Inbox",
    runs: 1284,
    runsToday: 38,
    minutesPerRun: 1.45,
    lastWorked: "2 min geleden",
    managers: "Elena Hart en beheerders",
    instructions: {
      role:
        "Je bent de **Waar is mijn bestelling**-agent van Northwind. Je beantwoordt elke vraag over waar een bestelling is, zo snel en zo warm als een goede collega. Schakel **@Elena Hart** alleen in als een pakket kwijt is of een klant boos is.",
      does: [
        "Lees de bestelling en de laatste update van de vervoerder voordat je antwoordt.",
        "Geef de echte status en een datum, nooit ‘binnenkort’.",
        "Meer dan 3 dagen vertraagd: bied je excuses aan en een kortingscode van 10%."
      ],
      handover: ["Pakket kwijt, beschadigd of een geschil: wijs het ticket toe aan het team."]
    },
    skills: [
      { name: "Northwind-toon", detail: "Warm, kort, voornaam", glyph: MessageSquare },
      { name: "Verzendbeleid", detail: "Levertijden en vervoerders per land", glyph: Package }
    ],
    triggers: [
      { id: "ticket", name: "Nieuw ticket", detail: "Een klant vraagt waar de bestelling is", glyph: Inbox, on: true },
      {
        id: "vermelding",
        name: "Vermelding",
        detail: "Iemand noemt de agent in een ticket of chat",
        glyph: At,
        on: true
      },
      {
        id: "prive",
        name: "Privébericht",
        detail: "Een collega vraagt naar een bestelstatus",
        glyph: MessageSquare,
        on: true
      },
      {
        id: "vertraging",
        name: "Zending vertraagd",
        detail: "De vervoerder meldt meer dan 2 dagen vertraging",
        glyph: Truck,
        on: false
      }
    ],
    permissions: [
      {
        id: "antwoord",
        action: "Een track & trace-antwoord sturen",
        setting: "zelf",
        standard: "vragen",
        risk: "De klant krijgt het antwoord direct, namens de winkel, zonder dat jij het eerst leest."
      },
      { id: "toewijzen", action: "Een ticket aan het team toewijzen", setting: "zelf", standard: "zelf" },
      {
        id: "korting",
        action: "Een kortingscode van 10% geven",
        setting: "vragen",
        standard: "vragen",
        risk: "De agent geeft korting zonder jouw ja. Een verstuurde code kost geld en haal je niet terug."
      },
      { id: "terugbetalen", action: "Terugbetalen of annuleren", setting: "nooit", standard: "nooit", locked: true }
    ],
    log: [
      {
        id: "log-5148",
        at: "14:28",
        text: "Status en bezorgdatum gestuurd",
        record: "Ticket #5148 · Astrid Berg",
        setting: "zelf",
        undo: "verstuurd"
      },
      {
        id: "log-5146",
        at: "14:12",
        text: "Kortingscode van 10% voorgesteld na 4 dagen vertraging",
        record: "Ticket #5146 · Luca Romano",
        setting: "vragen"
      },
      {
        id: "log-5141",
        at: "13:58",
        text: "Ticket aan Elena Hart toegewezen: pakket kwijt bij DPD",
        record: "Ticket #5141 · Hannah Schmidt",
        setting: "zelf",
        undo: "kan"
      }
    ],
    chat: [
      {
        from: "agent",
        at: "gisteren 18:31",
        text:
          "Hoi Elena, ik ben de Waar is mijn bestelling-agent. Ik beantwoord vragen over track & trace in de inbox en geef het door als een pakket kwijt is. Noem me in een ticket, wijs me een ticket toe of stuur me hier een bericht."
      },
      { from: "me", at: "gisteren 18:33", text: "Welke vervoerders kun je controleren?" },
      {
        from: "agent",
        at: "gisteren 18:33",
        text:
          "PostNL, DHL, DPD, UPS en ruim 1.500 andere vervoerders, via je track & trace-account. Klanten zien nooit dat een bestelling uit het buitenland komt."
      }
    ]
  },
  {
    id: "retouragent",
    name: "Retouragent",
    purpose: "Handelt retourvragen af en maakt het retourlabel",
    glyph: Returns,
    active: true,
    works: "Retouren",
    runs: 412,
    runsToday: 9,
    minutesPerRun: 4,
    lastWorked: "6 min geleden",
    managers: "Sofía Kim"
  },
  {
    id: "chargebacks",
    name: "Chargeback-assistent",
    purpose: "Stelt bewijspakketten op voor geschillen",
    glyph: CreditCard,
    active: true,
    works: "Chargebacks",
    runs: 37,
    runsToday: 1,
    minutesPerRun: 25,
    lastWorked: "1 u geleden",
    managers: "Elena Hart"
  },
  {
    id: "leveranciers",
    name: "Leveranciersopvolger",
    purpose: "Mailt leveranciers over vertraagde zendingen",
    glyph: Factory,
    active: true,
    works: "Leveranciers",
    runs: 156,
    runsToday: 6,
    minutesPerRun: 6,
    lastWorked: "22 min geleden",
    managers: "Ethan Jeppesen"
  },
  {
    id: "reviews",
    name: "Reviewbeantwoorder",
    purpose: "Beantwoordt productreviews in de Northwind-toon",
    glyph: MessageSquare,
    active: false,
    works: "Producten",
    runs: 88,
    runsToday: 0,
    minutesPerRun: 3,
    lastWorked: "3 dagen geleden",
    managers: "Maya Roy"
  },
  {
    id: "voorraad",
    name: "Voorraadwachter",
    purpose: "Waarschuwt als een bestseller bijna op is",
    glyph: Package,
    active: true,
    works: "Producten",
    runs: 64,
    runsToday: 2,
    minutesPerRun: 5,
    lastWorked: "48 min geleden",
    managers: "Ethan Jeppesen"
  },
  {
    id: "weekrapport",
    name: "Weekrapport",
    purpose: "Vat elke maandag de week samen voor het team",
    glyph: Zap,
    active: true,
    works: "Analyse",
    runs: 19,
    runsToday: 1,
    minutesPerRun: 45,
    lastWorked: "vanochtend 08:00",
    managers: "Elena Hart"
  }
]

/** Hours saved, from runs × minutes per run, rounded down. */
export const hoursSaved = (agent: Agent) => Math.floor((agent.runs * agent.minutesPerRun) / 60)

/**
 * What the agents did overnight and today, across all of them, newest first: Start's record and the
 * log's. Each line names the setting it ran under and the rule (the permission) that let it, so a
 * line never reads as the agent acting on a whim. The lines match the agents' own logs.
 */
export type Activity = {
  readonly id: string
  /** "14:28", or "vannacht 02:14" for the night before. */
  readonly at: string
  readonly agentId: string
  readonly text: string
  readonly record: string
  readonly setting: Autonomy
  /** The permission it ran under, as the rule reads on the agent's page. */
  readonly rule: string
}

export const ACTIVITY: ReadonlyArray<Activity> = [
  {
    id: "act-5148",
    at: "14:28",
    agentId: "waar-is-mijn-bestelling",
    text: "Status en bezorgdatum gestuurd aan Astrid Berg",
    record: "Ticket #5148",
    setting: "zelf",
    rule: "track & trace-antwoord sturen"
  },
  {
    id: "act-5141",
    at: "13:58",
    agentId: "waar-is-mijn-bestelling",
    text: "Ticket aan Elena Hart toegewezen: pakket kwijt bij DPD",
    record: "Ticket #5141",
    setting: "zelf",
    rule: "ticket aan het team toewijzen"
  },
  {
    id: "act-cb",
    at: "11:05",
    agentId: "chargebacks",
    text: "Bewijspakket voor Klarna opgesteld; indienen wacht op jou",
    record: "Chargeback #CB-2291",
    setting: "vragen",
    rule: "bewijs indienen bij Klarna"
  },
  {
    id: "act-week",
    at: "08:00",
    agentId: "weekrapport",
    text: "Week 16–22 nov samengevat op het bord Week",
    record: "Bord Week",
    setting: "zelf",
    rule: "een bord bijwerken"
  },
  {
    id: "act-stock",
    at: "vannacht 02:14",
    agentId: "voorraad",
    text: "Coastline Bomber Jacket in M bijna op: nog 6 stuks",
    record: "Product · Coastline Bomber",
    setting: "zelf",
    rule: "het team waarschuwen"
  },
  {
    id: "act-label",
    at: "vannacht 01:37",
    agentId: "retouragent",
    text: "Retourlabel gemaakt voor bestelling #5296",
    record: "Retour #R-879",
    setting: "zelf",
    rule: "retourlabel maken"
  }
]

/** What the agents will do later on their own schedule (Magnus → Gepland). */
export const SCHEDULED: ReadonlyArray<
  { readonly id: string; readonly agentId: string; readonly at: string; readonly text: string }
> = [
  {
    id: "plan-kestrel",
    agentId: "leveranciers",
    at: "vandaag 16:30",
    text: "Kestrel Goods opnieuw mailen als er geen antwoord is"
  },
  { id: "plan-stock", agentId: "voorraad", at: "elke dag 02:00", text: "Voorraad van de bestsellers nalopen" },
  { id: "plan-week", agentId: "weekrapport", at: "maandag 08:00", text: "De week samenvatten op het bord Week" },
  { id: "plan-reviews", agentId: "reviews", at: "gepauzeerd", text: "Nieuwe reviews beantwoorden" }
]

/** This month's use of an agent, against the workspace's AI limit (PRODUCT.md: a monthly spend limit, warning at 80%). */
export function usageOf(agent: Agent) {
  const runs = Math.round(agent.runs * 0.24)
  const spend = Math.round(runs * agent.minutesPerRun * 0.9) / 100
  return { runs, spend, limit: 40, since: "1 nov" } as const
}

/** The versions of an agent's instructions, newest first; the first is what runs now. */
export type InstructionVersion = {
  readonly id: string
  readonly at: string
  readonly by: string
  readonly change: string
  readonly role: string
}

export function versionsOf(agent: Agent): ReadonlyArray<InstructionVersion> {
  const now = agent.instructions?.role ?? `Je bent de ${agent.name} van Northwind. ${agent.purpose}.`
  const all: ReadonlyArray<InstructionVersion> = [
    {
      id: "v4",
      at: "2 min geleden",
      by: "Sofía Kim",
      change: agent.instructions === undefined ? "Doel aangescherpt" : "Overdracht bij een boze klant toegevoegd",
      role: now
    },
    {
      id: "v3",
      at: "18 nov",
      by: "Elena Hart",
      change: "Korting van 10% na 3 dagen vertraging",
      role: now.replace(" of een klant boos is", "")
    },
    {
      id: "v2",
      at: "4 nov",
      by: "Sofía Kim",
      change: "Toon: warm en kort, met voornaam",
      role: `Je bent de **${agent.name}** van Northwind. ${agent.purpose}, warm en kort.`
    },
    {
      id: "v1",
      at: "30 okt",
      by: "Magnus, met Elena Hart",
      change: "Agent gemaakt",
      role: `${agent.purpose}.`
    }
  ]
  // An agent without written instructions has fewer real versions: drop the ones that read the same.
  return all.filter((version, i) => all.findIndex((v) => v.role === version.role) === i)
}

/** Skills a workspace has that an agent does not use yet: what "Vaardigheid toevoegen" offers. */
export const MORE_SKILLS: ReadonlyArray<{ readonly name: string; readonly detail: string; readonly glyph: Glyph }> = [
  { name: "Retourbeleid", detail: "Termijnen en voorwaarden", glyph: Returns },
  { name: "Maattabellen", detail: "Per product en leverancier", glyph: Package },
  { name: "Klarna-geschillen", detail: "Wat Klarna als bewijs wil", glyph: CreditCard }
]
