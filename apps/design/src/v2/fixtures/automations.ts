import { customer, CUSTOMERS, ORDERS, PRODUCTS, when } from "./records.ts"
import type { Order } from "./records.ts"
import { PEOPLE } from "./workspace.ts"

/**
 * Automatiseringen: Northwind's flows, the library they start from and what they did. Rebuilt from
 * the current demo's `mock-data/automations.ts` and the domain's template list
 * (`@insyte/domain/automations/Templates`), on this version's clock and records: a run names a real
 * order (`fixtures/records.ts`), a flow names who last changed it, and what it touches is a record
 * the werkdraad can open.
 *
 * An automation is not an agent (`fixtures/agents.ts`): a flow is a fixed sequence of steps on one
 * trigger; an agent reads, decides and asks. Where a flow hands work to an agent, it says so.
 */

export type FlowStatus = "actief" | "gepauzeerd" | "concept"

export const FLOW_STATUS: Readonly<
  Record<FlowStatus, { readonly label: string; readonly tone: "good" | "warn" | "neutral" }>
> = {
  actief: { label: "Actief", tone: "good" },
  gepauzeerd: { label: "Gepauzeerd", tone: "warn" },
  concept: { label: "Concept", tone: "neutral" }
}

/** What a step is: the thing that starts the flow, a check, a pause, something Insyte writes, or an action. */
export type StepKind = "trigger" | "voorwaarde" | "wachten" | "ai" | "actie"

export const STEP_KIND: Readonly<Record<StepKind, string>> = {
  trigger: "Trigger",
  voorwaarde: "Voorwaarde",
  wachten: "Wachten",
  ai: "AI-stap",
  actie: "Actie"
}

/** One kind of step the editor offers: its name, the right it needs and the fields it asks for. */
export type StepType = {
  readonly id: string
  readonly kind: StepKind
  readonly label: string
  /** What it does, in one line, for the palette. */
  readonly detail: string
  readonly scope?: Scope
  readonly fields: ReadonlyArray<
    { readonly key: string; readonly label: string; readonly placeholder?: string; readonly required?: boolean }
  >
  /** The service it runs through, when that is not Insyte itself. */
  readonly via?: string
}

export type Scope =
  | "orders.read"
  | "orders.write"
  | "customers.read"
  | "customers.write"
  | "customers.email"
  | "tickets.write"
  | "team.notify"
  | "suppliers.message"
  | "refunds.write"
  | "disputes.write"
  | "stock.read"
  | "marketing.write"
  | "ai.draft"

/** The rights a flow can be given, as the settings list them (`@insyte/domain/automations/Scopes`). */
export const SCOPES: ReadonlyArray<{ readonly id: Scope; readonly label: string }> = [
  { id: "orders.read", label: "Bestellingen lezen" },
  { id: "orders.write", label: "Bestellingen bewerken" },
  { id: "customers.read", label: "Klanten lezen" },
  { id: "customers.write", label: "Klanten labelen" },
  { id: "customers.email", label: "Klanten mailen" },
  { id: "tickets.write", label: "Tickets maken" },
  { id: "team.notify", label: "Collega's berichten" },
  { id: "suppliers.message", label: "Leveranciers berichten" },
  { id: "refunds.write", label: "Terugbetalen" },
  { id: "disputes.write", label: "Geschillen beantwoorden" },
  { id: "stock.read", label: "Voorraad lezen" },
  { id: "marketing.write", label: "Campagnes beheren" },
  { id: "ai.draft", label: "AI laten opstellen" }
]

const f = (key: string, label: string, placeholder?: string) =>
  placeholder === undefined ? { key, label } : { key, label, placeholder }
/** A field the step cannot run without: a test stops on it while it is empty. */
const need = (key: string, label: string, placeholder?: string) => ({ ...f(key, label, placeholder), required: true })

export const STEP_TYPES: ReadonlyArray<StepType> = [
  /* triggers */
  {
    id: "order_placed",
    kind: "trigger",
    label: "Bestelling geplaatst",
    detail: "Een nieuwe bestelling in Shopify",
    scope: "orders.read",
    fields: [f("filter", "Alleen als", "Totaal boven € 100")]
  },
  {
    id: "order_shipped",
    kind: "trigger",
    label: "Bestelling verzonden",
    detail: "Shopify markeert een bestelling als verzonden",
    scope: "orders.read",
    fields: []
  },
  {
    id: "shipping_delay",
    kind: "trigger",
    label: "Levering vertraagd",
    detail: "De track & trace staat te lang stil",
    scope: "orders.read",
    fields: [f("hours", "Na (uur zonder scan)", "48")]
  },
  {
    id: "refund_requested",
    kind: "trigger",
    label: "Terugbetaling aangevraagd",
    detail: "Een klant of collega vraagt om geld terug",
    scope: "orders.read",
    fields: [f("above", "Boven (bedrag)", "€ 100")]
  },
  {
    id: "refund_done",
    kind: "trigger",
    label: "Terugbetaling uitgevoerd",
    detail: "Er is geld teruggestort",
    scope: "orders.read",
    fields: []
  },
  {
    id: "chargeback",
    kind: "trigger",
    label: "Chargeback ontvangen",
    detail: "De bank of Klarna opent een geschil",
    scope: "orders.read",
    fields: []
  },
  {
    id: "customer_reply",
    kind: "trigger",
    label: "Antwoord van klant",
    detail: "Een klant antwoordt in een open gesprek",
    scope: "customers.read",
    fields: []
  },
  {
    id: "review",
    kind: "trigger",
    label: "Review ontvangen",
    detail: "Een nieuwe review in de winkel",
    scope: "customers.read",
    fields: [f("stars", "Sterren", "1 of 2")]
  },
  {
    id: "stock_low",
    kind: "trigger",
    label: "Lage voorraad",
    detail: "Een product zakt onder een drempel",
    scope: "stock.read",
    fields: [f("threshold", "Drempel (stuks)", "20")]
  },
  {
    id: "email_keyword",
    kind: "trigger",
    label: "Inkomende e-mail met trefwoord",
    detail: "Een mail in de inbox bevat een woord",
    scope: "customers.read",
    fields: [f("contains", "Onderwerp of bericht bevat", "retour")]
  },
  {
    id: "schedule",
    kind: "trigger",
    label: "Volgens schema",
    detail: "Elke dag, elke maandag of elke maand",
    fields: [f("when", "Hoe vaak", "Elke dag om 9:00")]
  },
  /* conditions */
  {
    id: "branch",
    kind: "voorwaarde",
    label: "Ja/nee-splitsing",
    detail: "Twee wegen, op één voorwaarde",
    fields: [need("rule", "Voorwaarde", "{{bestelling.totaal}} > 100")]
  },
  {
    id: "filter",
    kind: "voorwaarde",
    label: "Filter",
    detail: "Alleen verder als het klopt",
    fields: [need("rule", "Voorwaarde", "Totaal boven € 100")]
  },
  {
    id: "country",
    kind: "voorwaarde",
    label: "Land is gelijk aan",
    detail: "Op het land van de klant",
    fields: [need("country", "Land", "Duitsland")]
  },
  {
    id: "tag_match",
    kind: "voorwaarde",
    label: "Label komt overeen",
    detail: "Op een label van de klant of bestelling",
    fields: [need("tag", "Label", "vip")]
  },
  /* waiting */
  {
    id: "wait",
    kind: "wachten",
    label: "Wachten",
    detail: "Een vaste tijd",
    fields: [need("time", "Hoe lang", "24 uur")]
  },
  {
    id: "wait_reply",
    kind: "wachten",
    label: "Wachten op antwoord",
    detail: "Tot de klant antwoordt of de tijd om is",
    fields: [f("time", "Hoogstens", "48 uur")]
  },
  /* AI */
  {
    id: "ai_compose",
    kind: "ai",
    label: "Antwoord opstellen",
    detail: "Een tekst in de stem van het merk",
    scope: "ai.draft",
    fields: [f("tone", "Toon", "Warm"), f("instructions", "Instructies", "Kort, met de voornaam")]
  },
  {
    id: "ai_classify",
    kind: "ai",
    label: "Sentiment lezen",
    detail: "Klinkt de klant tevreden, neutraal of boos",
    scope: "ai.draft",
    fields: []
  },
  {
    id: "ai_summarize",
    kind: "ai",
    label: "Gesprek samenvatten",
    detail: "Een samenvatting op het ticket",
    scope: "ai.draft",
    fields: []
  },
  {
    id: "ai_link_orders",
    kind: "ai",
    label: "Bestellingen koppelen",
    detail: "De bestellingen van de klant erbij zoeken",
    scope: "orders.read",
    fields: []
  },
  /* actions */
  {
    id: "send_email",
    kind: "actie",
    label: "E-mail sturen",
    detail: "Naar de klant, via Resend",
    scope: "customers.email",
    via: "Resend",
    fields: [need("to", "Aan", "{{klant.e-mail}}"), need("subject", "Onderwerp"), f("body", "Bericht")]
  },
  {
    id: "klaviyo_send",
    kind: "actie",
    label: "Klaviyo-mail sturen",
    detail: "Een flow of campagne in Klaviyo",
    scope: "marketing.write",
    via: "Klaviyo",
    fields: [need("template", "Sjabloon", "Vertraging")]
  },
  {
    id: "create_ticket",
    kind: "actie",
    label: "Ticket aanmaken",
    detail: "Een ticket in de inbox",
    scope: "tickets.write",
    fields: [need("title", "Titel"), f("queue", "Wachtrij", "Nieuw"), f("assignee", "Toewijzen aan")]
  },
  {
    id: "tag_customer",
    kind: "actie",
    label: "Klant labelen",
    detail: "Een label op het klantprofiel",
    scope: "customers.write",
    fields: [need("tag", "Label", "vip")]
  },
  {
    id: "notify_supplier",
    kind: "actie",
    label: "Leverancier berichten",
    detail: "Een bericht in het leveranciersportaal",
    scope: "suppliers.message",
    fields: [need("supplier", "Leverancier"), need("message", "Bericht")]
  },
  {
    id: "alert_team",
    kind: "actie",
    label: "Collega waarschuwen",
    detail: "Een melding in Insyte of in Slack",
    scope: "team.notify",
    fields: [need("who", "Wie", "Sofía Kim"), f("channel", "Kanaal", "#cx")]
  },
  {
    id: "require_approval",
    kind: "actie",
    label: "Goedkeuring vragen",
    detail: "De flow wacht tot iemand ja zegt",
    fields: [need("approver", "Goedkeuring door", "Elena Hart")]
  },
  {
    id: "stripe_refund",
    kind: "actie",
    label: "Terugbetalen via Stripe",
    detail: "Geld terug op de betaalmethode",
    scope: "refunds.write",
    via: "Stripe",
    fields: [f("amount", "Bedrag", "volledig")]
  },
  {
    id: "dispute_evidence",
    kind: "actie",
    label: "Bewijs verzamelen",
    detail: "Track & trace en mails bij het geschil",
    scope: "disputes.write",
    fields: []
  }
]

export const stepType = (id: string) => STEP_TYPES.find((t) => t.id === id)

export type Step = {
  readonly id: string
  readonly type: string
  /** What the step does in this flow, in the flow's own words. */
  readonly summary: string
  readonly values?: Readonly<Record<string, string>>
  /** A Ja/nee-splitsing's two lanes; they meet again under it. */
  readonly branches?: { readonly yes: ReadonlyArray<Step>; readonly no: ReadonlyArray<Step> }
}

/** Every step of a flow, the lanes of a splitsing included, in the order they are drawn. */
export const flatSteps = (steps: ReadonlyArray<Step>): ReadonlyArray<Step> =>
  steps.flatMap((st) => (st.branches === undefined ? [st] : [st, ...st.branches.yes, ...st.branches.no]))

export type RunStatus = "geslaagd" | "mislukt" | "wacht" | "dubbel" | "bezig"

export const RUN_STATUS: Readonly<
  Record<RunStatus, { readonly label: string; readonly tone: "good" | "bad" | "warn" | "neutral" | "accent" }>
> = {
  geslaagd: { label: "Geslaagd", tone: "good" },
  mislukt: { label: "Mislukt", tone: "bad" },
  wacht: { label: "Wacht", tone: "warn" },
  dubbel: { label: "Dubbel", tone: "neutral" },
  bezig: { label: "Bezig", tone: "accent" }
}

export type Run = {
  readonly id: string
  readonly automationId: string
  /** The record that set it off: an order number, or null for a scheduled or manual run. */
  readonly record: { readonly label: string; readonly href: string; readonly who?: string } | null
  readonly at: string
  /** Sortable: minutes before now. */
  readonly ago: number
  readonly seconds: number
  readonly status: RunStatus
  readonly version: number
  /** For a failed run: the step it stopped at, why, and how to fix it. */
  readonly failed?: { readonly step: string; readonly why: string; readonly fix: string }
  readonly waiting?: string
  /** What the run started from, as the trigger handed it over. */
  readonly input?: Readonly<Record<string, string>>
  /** The lane it took at a Ja/nee-splitsing. */
  readonly lane?: "yes" | "no"
}

/** A change to a flow's settings, for its logboek: who, when, what. */
type LogEntry = { readonly by: string; readonly at: string; readonly what: string }

/** A record the flow reads or changes, for the werkdraad and the overview. */
export type Touch = {
  readonly kind: "order" | "ticket" | "supplier" | "product" | "chargeback" | "agent" | "customer" | "page"
  readonly label: string
  readonly href: string
  readonly meta: string
}

export type Version = { readonly v: number; readonly by: string; readonly at: string; readonly note: string }

export type Automation = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly status: FlowStatus
  readonly steps: ReadonlyArray<Step>
  /** Everything it ever ran, and in the last 30 days. */
  readonly runs: number
  readonly runs30: number
  readonly lastRun: string | null
  /** The person who owns it and the one who changed it last, as `PEOPLE` keys. */
  readonly owner: keyof typeof PEOPLE
  readonly editedBy: keyof typeof PEOPLE
  readonly editedAt: string
  /** The live version; 0 is never published. */
  readonly version: number
  readonly unpublished?: boolean
  readonly versions: ReadonlyArray<Version>
  readonly touches: ReadonlyArray<Touch>
  readonly createdAt: string
  /** A sentence on why it is paused, when it is. */
  readonly pausedWhy?: string
  /** Rights the flow needs but that were switched off; the step that uses one fails. */
  readonly scopesOff?: ReadonlyArray<Scope>
  /** How many runs it may start: "0" is no limit, "100u" a hundred an hour. */
  readonly limit?: string
  /** Who hears about a failed run. */
  readonly notify?: keyof typeof PEOPLE
  /** Changes to its settings, newest first. */
  readonly log?: ReadonlyArray<LogEntry>
}

/* ── the runs, on real orders ─────────────────────────────────────────────────────────────────── */

const MIN = 60_000
const NOW = new Date(2026, 10, 23, 14, 30).getTime()
const ago = (at: Date) => Math.max(0, Math.round((NOW - at.getTime()) / MIN))

const orderRecord = (o: Order) => ({
  label: `#${o.number}`,
  href: `/v2/bestellingen/${o.number}`,
  who: customer(o.customerId)?.name
})

const COUNTRY: Readonly<Record<string, string>> = {
  NL: "Nederland",
  BE: "België",
  DE: "Duitsland",
  FR: "Frankrijk",
  NO: "Noorwegen",
  SE: "Zweden",
  IT: "Italië",
  ES: "Spanje",
  GB: "Verenigd Koninkrijk",
  IE: "Ierland",
  PL: "Polen",
  PT: "Portugal"
}

/** What an order hands a flow when it sets one off: the fields a step can write as `{{veld}}`. */
function orderInput(o: Order): Readonly<Record<string, string>> {
  const c = customer(o.customerId)
  return {
    Bestelling: `#${o.number}`,
    Klant: c?.name ?? "Onbekend",
    "E-mail": c?.email ?? "Onbekend",
    Totaal: `€ ${o.total.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    Land: COUNTRY[c?.country ?? ""] ?? c?.country ?? "Onbekend",
    Vervoerder: o.carrier
  }
}

const late = ORDERS.filter((o) => o.status === "vertraagd")
const refunded = ORDERS.filter((o) => o.status === "terugbetaald")
const placedToday = ORDERS.filter((o) => o.placedAt.getTime() >= new Date(2026, 10, 23).getTime())
const shipped = ORDERS.filter((o) => o.status === "bezorgd")

/** A run some minutes after the order it is about. */
function runOn(automationId: string, o: Order, i: number, status: RunStatus, after: number, extra: Partial<Run> = {}) {
  const at = new Date(Math.min(o.placedAt.getTime() + after * MIN, NOW - (i + 1) * 7 * MIN))
  return {
    id: `${automationId}-${o.number}`,
    automationId,
    record: orderRecord(o),
    at: when(at),
    ago: ago(at),
    seconds: 1.2 + ((Number(o.number) * 7) % 30) / 10,
    status,
    version: 3,
    input: orderInput(o),
    ...extra
  } satisfies Run
}

const luca = ORDERS.find((o) => o.number === "5309")

function delayRuns(): ReadonlyArray<Run> {
  const list: Array<Run> = []
  if (luca !== undefined) {
    list.push({
      ...runOn("vertraagde-bestelling", luca, 0, "geslaagd", 0, { lane: luca.total > 100 ? "yes" : "no" }),
      at: "vandaag 07:00",
      ago: 450
    })
  }
  late.filter((o) => o.number !== "5309").slice(0, 7).forEach((o, i) => {
    const status: RunStatus = i === 1 ? "mislukt" : i === 4 ? "dubbel" : "geslaagd"
    const lane = o.total > 100 ? "yes" : "no"
    list.push({
      ...runOn("vertraagde-bestelling", o, i + 1, status, 2 * 24 * 60, { lane }),
      ...(status === "mislukt"
        ? {
          failed: {
            step: lane === "yes" ? "Excuses + 10% korting" : "Vertragingsmail naar klant sturen",
            why: "Klaviyo weigerde de mail: het adres van de klant is twee keer teruggekomen (bounce).",
            fix:
              "Vraag de klant via de winkelchat om een ander adres, of zet het adres in het klantprofiel goed en voer de run opnieuw uit."
          }
        }
        : {})
    })
  })
  return list
}

function confirmRuns(): ReadonlyArray<Run> {
  return placedToday.slice(0, 12).map((o, i) => runOn("orderbevestiging", o, i, "geslaagd", 1))
}

function refundRuns(): ReadonlyArray<Run> {
  return refunded.slice(0, 9).map((o, i) => runOn("terugbetaling-excuses", o, i, "geslaagd", 3 * 24 * 60))
}

function feedbackRuns(): ReadonlyArray<Run> {
  return shipped.slice(0, 6).map((o, i) =>
    runOn(
      "feedback-vragen",
      o,
      i,
      i === 0 ? "wacht" : "geslaagd",
      5 * 24 * 60,
      i === 0 ? { waiting: "De run wacht 24 uur na de bezorging. Daarna gaat hij vanzelf verder." } : {}
    )
  )
}

function reviewRuns(): ReadonlyArray<Run> {
  const astrid = ORDERS.find((o) => o.number === "5296")
  if (astrid === undefined) return []
  return [
    {
      ...runOn("negatieve-review", astrid, 0, "wacht", 2 * 24 * 60),
      at: "vandaag 09:12",
      ago: 318,
      waiting:
        "Insyte heeft een antwoord aan de reviewer klaargezet. De run gaat verder zodra iemand het uitvoert of negeert."
    }
  ]
}

/* ── the flows ────────────────────────────────────────────────────────────────────────────────── */

const s = (id: string, type: string, summary: string, values?: Record<string, string>): Step =>
  values === undefined ? { id, type, summary } : { id, type, summary, values }

const v = (n: number, by: keyof typeof PEOPLE, at: string, note: string): Version => ({
  v: n,
  by: PEOPLE[by].name,
  at,
  note
})

const aurora = { kind: "product", label: "Aurora Hooded Fleece", href: "/v2/producten/aurora-hooded-fleece" } as const

export const SEED: ReadonlyArray<Automation> = [
  {
    id: "vertraagde-bestelling",
    name: "Vertraagde bestelling → e-mail + ticket",
    description: "Laat de klant het weten en wijst toe aan de geschillenmanager als een levering 2+ dagen te laat is.",
    status: "actief",
    steps: [
      s("t", "shipping_delay", "Verzending van bestelling 48 u niet bijgewerkt", { hours: "48" }),
      s("c", "filter", "Alleen bestellingen die nog niet bezorgd zijn", { rule: "Status is niet Bezorgd" }),
      {
        ...s("b", "branch", "Bestelling boven € 100?", { rule: "{{bestelling.totaal}} > 100" }),
        branches: {
          yes: [
            s("ai", "ai_compose", "Excuses met de nieuwe leverdatum opstellen", {
              tone: "Warm",
              instructions: "Kort, met de voornaam, de nieuwe leverdatum en de code SORRY10"
            }),
            s("a1y", "klaviyo_send", "Excuses + 10% korting", { template: "Excuses met korting" })
          ],
          no: [s("a1", "klaviyo_send", "Vertragingsmail naar klant sturen", { template: "Vertraging" })]
        }
      },
      s("a2", "create_ticket", "Ticket aanmaken in Nieuw", {
        title: "Bestelling {{bestelling.nummer}} is vertraagd",
        queue: "Nieuw",
        assignee: "Waar is mijn bestelling"
      })
    ],
    runs: 184,
    runs30: 24,
    lastRun: "vandaag 07:00",
    owner: "elena",
    editedBy: "sofia",
    editedAt: "20 nov",
    version: 3,
    versions: [
      v(3, "sofia", "20 nov", "Splitsing op bestelwaarde; het ticket gaat naar de agent Waar is mijn bestelling"),
      v(2, "elena", "4 nov", "Van 72 naar 48 uur zonder scan"),
      v(1, "elena", "12 jan", "Eerste publicatie")
    ],
    touches: [
      { kind: "order", label: "Bestelling #5309", href: "/v2/bestellingen/5309", meta: "4 dagen te laat" },
      { kind: "ticket", label: "Ticket #5146", href: "/v2/inbox/5146", meta: "maakte het ticket" },
      { kind: "supplier", label: "Kestrel Goods", href: "/v2/leveranciers/kestrel-goods", meta: "6 vertraagd" },
      {
        kind: "agent",
        label: "Waar is mijn bestelling",
        href: "/v2/magnus/agents/waar-is-mijn-bestelling",
        meta: "pakt het ticket op"
      }
    ],
    createdAt: "12 jan",
    limit: "100u",
    notify: "sofia",
    log: [
      { by: "Sofía Kim", at: "20 nov 16:02", what: "zette de limiet op 100 per uur" },
      { by: "Sofía Kim", at: "20 nov 16:01", what: "liet meldingen bij een fout naar zichzelf gaan" },
      { by: "Elena Hart", at: "4 nov 10:15", what: "zette ‘Klanten mailen’ aan" }
    ]
  },
  {
    id: "orderbevestiging",
    name: "Orderbevestiging",
    description: "Bevestigt de klant dat de bestelling is geplaatst.",
    status: "actief",
    steps: [
      s("t", "order_placed", "Bestelling geplaatst"),
      s("a1", "send_email", "Bevestigingsmail sturen", {
        to: "{{klant.e-mail}}",
        subject: "We hebben je bestelling {{bestelling.nummer}}"
      }),
      s("a2", "send_email", "Bon sturen", { to: "{{klant.e-mail}}", subject: "Je bon van Northwind" })
    ],
    runs: 21_640,
    runs30: 4_810,
    lastRun: "vandaag 14:28",
    owner: "elena",
    editedBy: "elena",
    editedAt: "22 jan",
    version: 2,
    versions: [v(2, "elena", "22 jan", "Bon als tweede mail"), v(1, "elena", "22 jan", "Eerste publicatie")],
    touches: [{ kind: "page", label: "Bestellingen", href: "/v2/bestellingen", meta: "86 vandaag" }],
    createdAt: "22 jan"
  },
  {
    id: "terugbetaling-excuses",
    name: "Terugbetaling → persoonlijke excuses",
    description: "Stuurt na een verwerkte terugbetaling een handgeschreven excuus.",
    status: "actief",
    steps: [
      s("t", "refund_done", "Terugbetaling uitgevoerd"),
      s("ai", "ai_compose", "Excuses in de stem van het merk", { tone: "Warm", instructions: "Kort, met de voornaam" }),
      s("a1", "send_email", "Excuusmail sturen", {
        to: "{{klant.e-mail}}",
        subject: "Het spijt ons, {{klant.voornaam}}"
      }),
      s("a2", "alert_team", "CX-kanaal melden", { who: "Sofía Kim", channel: "#cx" })
    ],
    runs: 164,
    runs30: 138,
    lastRun: "gisteren 18:30",
    owner: "sofia",
    editedBy: "sofia",
    editedAt: "4 feb",
    version: 1,
    versions: [v(1, "sofia", "4 feb", "Eerste publicatie")],
    touches: [
      { ...aurora, meta: "26 van de 41 terugbetalingen" },
      { kind: "page", label: "Retouren", href: "/v2/retouren", meta: "waar ze vandaan komen" }
    ],
    createdAt: "4 feb"
  },
  {
    id: "feedback-vragen",
    name: "Feedback vragen",
    description: "Vraagt de klant na de levering om feedback, om de service te verbeteren.",
    status: "actief",
    steps: [
      s("t", "order_shipped", "Levering bevestigd"),
      s("w", "wait", "24 uur na de bezorging", { time: "24 uur" }),
      s("a1", "send_email", "Enquête sturen", { to: "{{klant.e-mail}}", subject: "Hoe was je bestelling?" })
    ],
    runs: 47,
    runs30: 9,
    lastRun: "vandaag 02:00",
    owner: "sofia",
    editedBy: "sofia",
    editedAt: "4 feb",
    version: 1,
    versions: [v(1, "sofia", "4 feb", "Eerste publicatie")],
    touches: [{ kind: "page", label: "Klanten", href: "/v2/klanten", meta: "krijgen de enquête" }],
    createdAt: "4 feb"
  },
  {
    id: "negatieve-review",
    name: "Melding bij negatieve review",
    description: "Waarschuwt de oprichters als er een review van 1 of 2 sterren in de winkel verschijnt.",
    status: "actief",
    steps: [
      s("t", "review", "Nieuwe review van 1–2 sterren", { stars: "1 of 2" }),
      s("ai", "ai_compose", "Persoonlijk antwoord aan de reviewer", { tone: "Warm" }),
      s("a1", "alert_team", "Slack #founders", { who: "Elena Hart", channel: "#founders" }),
      s("a2", "create_ticket", "Ticket aanmaken", { title: "Review van {{review.sterren}} ster", queue: "Nieuw" })
    ],
    runs: 5,
    runs30: 5,
    lastRun: "vandaag 09:12",
    owner: "elena",
    editedBy: "elena",
    editedAt: "15 mrt",
    version: 2,
    versions: [v(2, "elena", "15 mrt", "Antwoord aan de reviewer erbij"), v(1, "elena", "1 mrt", "Eerste publicatie")],
    touches: [
      { kind: "agent", label: "Reviewbeantwoorder", href: "/v2/magnus/agents/reviews", meta: "stelt het antwoord op" },
      { kind: "customer", label: "Astrid Berg", href: "/v2/klanten/astrid-berg", meta: "review van 2 sterren" }
    ],
    createdAt: "1 mrt"
  },
  {
    id: "account-heractiveren",
    name: "Account heractiveren",
    description: "Laat de gebruiker weten dat het account inactief is en biedt stappen om het te heractiveren.",
    status: "actief",
    steps: [
      s("t", "schedule", "Account 30 dagen inactief", { when: "Elke dag om 9:00" }),
      s("a1", "send_email", "Heractivatie-e-mail sturen", {
        to: "{{klant.e-mail}}",
        subject: "We missen je bij Northwind"
      }),
      s("w", "wait", "Een week later", { time: "7 dagen" }),
      s("a2", "send_email", "Herinnering sturen", { to: "{{klant.e-mail}}", subject: "Je account staat nog klaar" })
    ],
    runs: 34,
    runs30: 12,
    lastRun: "vandaag 09:00",
    owner: "elena",
    editedBy: "maya",
    editedAt: "1 feb",
    version: 1,
    versions: [v(1, "maya", "1 feb", "Eerste publicatie")],
    touches: [{ kind: "page", label: "Klanten", href: "/v2/klanten", meta: "30 dagen inactief" }],
    createdAt: "1 feb"
  },
  {
    id: "accountverificatie",
    name: "Accountverificatie",
    description: "Vraagt de gebruiker het e-mailadres te bevestigen om het account te activeren.",
    status: "actief",
    steps: [
      s("t", "customer_reply", "Account aangemaakt"),
      s("a1", "send_email", "E-mail sturen", { to: "{{klant.e-mail}}", subject: "Bevestig je e-mailadres" })
    ],
    runs: 150,
    runs30: 30,
    lastRun: "vandaag 08:00",
    owner: "elena",
    editedBy: "maya",
    editedAt: "15 mrt",
    version: 1,
    versions: [v(1, "maya", "15 mrt", "Eerste publicatie")],
    touches: [{ kind: "page", label: "Klanten", href: "/v2/klanten", meta: "nieuwe accounts" }],
    createdAt: "15 mrt"
  },
  {
    id: "wachtwoord-herstellen",
    name: "Wachtwoord opnieuw instellen",
    description: "Stuurt op verzoek van de gebruiker een link om het wachtwoord opnieuw in te stellen.",
    status: "actief",
    steps: [
      s("t", "email_keyword", "Nieuw wachtwoord aangevraagd"),
      s("a1", "send_email", "Link sturen", { to: "{{klant.e-mail}}", subject: "Je nieuwe wachtwoord instellen" })
    ],
    runs: 92,
    runs30: 18,
    lastRun: "vandaag 13:00",
    owner: "elena",
    editedBy: "ethan",
    editedAt: "1 mrt",
    version: 1,
    versions: [v(1, "ethan", "1 mrt", "Eerste publicatie")],
    touches: [{ kind: "page", label: "Klanten", href: "/v2/klanten", meta: "vragen een nieuw wachtwoord" }],
    createdAt: "1 mrt"
  },
  {
    id: "groothandelsleads",
    name: "Groothandelsleads doorsturen",
    description: "Inkomende e-mails met 'groothandel' of 'bulk' gaan naar een nieuwe leadpijplijn.",
    status: "gepauzeerd",
    pausedWhy: "Gepauzeerd door Elena Hart op 30 okt: er komen nu weinig groothandelsaanvragen binnen.",
    steps: [
      s("t", "email_keyword", "Inkomende e-mail met trefwoord", { contains: "groothandel, bulk" }),
      s("a1", "tag_customer", "Gesprek labelen", { tag: "groothandel" }),
      s("a2", "alert_team", "Sales melden", { who: "Elena Hart" })
    ],
    runs: 0,
    runs30: 0,
    lastRun: "30 okt",
    owner: "elena",
    editedBy: "elena",
    editedAt: "30 okt",
    version: 1,
    versions: [v(1, "elena", "18 feb", "Eerste publicatie")],
    touches: [{ kind: "page", label: "Inbox", href: "/v2/inbox", meta: "leest de mail" }],
    createdAt: "18 feb"
  },
  {
    id: "chargebacks-binnenhalen",
    name: "Chargebacks binnenhalen",
    description: "Verzamelt bewijs en start automatisch het antwoord op het geschil.",
    status: "gepauzeerd",
    pausedWhy:
      "Gepauzeerd door Elena Hart op 12 okt: de Chargeback-assistent stelt nu het bewijspakket op, en indienen doet een persoon.",
    steps: [
      s("t", "chargeback", "Chargeback ontvangen"),
      s("a1", "dispute_evidence", "Verzendbevestiging ophalen"),
      s("a2", "create_ticket", "Zaak openen", { title: "Chargeback {{geschil.id}}", queue: "Geschillen" }),
      s("a3", "alert_team", "Toewijzen aan Geschillen", { who: "Elena Hart" })
    ],
    runs: 8,
    runs30: 0,
    lastRun: "12 okt",
    owner: "elena",
    editedBy: "elena",
    editedAt: "12 okt",
    version: 2,
    versions: [v(2, "elena", "12 okt", "Gepauzeerd"), v(1, "elena", "22 jan", "Eerste publicatie")],
    touches: [
      { kind: "chargeback", label: "CB-2291", href: "/v2/chargebacks/cb-2291", meta: "nu bij de agent" },
      { kind: "agent", label: "Chargeback-assistent", href: "/v2/magnus/agents/chargebacks", meta: "doet dit nu" }
    ],
    createdAt: "22 jan"
  },
  {
    id: "lage-voorraad",
    name: "Lage voorraad → concept-nabestelling",
    description: "Stelt een nabestelling bij de leverancier op als een SKU onder de drempel zakt.",
    status: "concept",
    steps: [
      s("t", "stock_low", "Voorraad < 20 stuks", { threshold: "20" }),
      s("a1", "notify_supplier", "Leverancier vragen om na te leveren", { supplier: "De leverancier van het product" }),
      s("a2", "alert_team", "Operations inlichten", { who: "Ethan Jeppesen" })
    ],
    runs: 0,
    runs30: 0,
    lastRun: null,
    owner: "ethan",
    editedBy: "ethan",
    editedAt: "10 nov",
    version: 0,
    unpublished: true,
    versions: [],
    touches: [
      { kind: "product", label: "Sequoia Flannel", href: "/v2/producten/sequoia-flannel", meta: "nog 12" },
      { kind: "product", label: "Field Pant · Stone", href: "/v2/producten/field-pant-stone", meta: "uitverkocht" },
      { kind: "supplier", label: "DPC Apparel", href: "/v2/leveranciers/dpc-apparel", meta: "levert beide" }
    ],
    createdAt: "10 nov"
  },
  {
    id: "herhaalde-klachten",
    name: "Melding bij herhaalde klachten",
    description: "Maakt automatisch een ticket als er binnen 24 u 3+ gelijke klachten binnenkomen.",
    status: "concept",
    steps: [
      s("t", "customer_reply", "3 gelijke feedbackmeldingen van klanten binnen 24 uur"),
      s("ai", "ai_classify", "Patroon herkennen in de klacht"),
      s("a1", "create_ticket", "Ticket met hoge prioriteit aanmaken", { title: "Patroon: {{klacht}}", queue: "Nieuw" }),
      s("a2", "alert_team", "CX-lead waarschuwen", { who: "Sofía Kim", channel: "#cx" })
    ],
    runs: 7,
    runs30: 0,
    lastRun: "9 nov",
    owner: "sofia",
    editedBy: "sofia",
    editedAt: "9 nov",
    version: 0,
    unpublished: true,
    versions: [],
    touches: [
      { ...aurora, meta: "21 keer ‘valt te klein’" },
      {
        kind: "supplier",
        label: "Allure Fulfillment",
        href: "/v2/leveranciers/allure-fulfillment",
        meta: "leverde de S"
      }
    ],
    createdAt: "1 mrt"
  }
]

/* The busy week: thirty more flows, with the long names an operator actually gives them. */
const BUSY_TOPICS: ReadonlyArray<readonly [string, string, ReadonlyArray<readonly [string, string]>]> = [
  [
    "Vertraagde zending naar Duitsland of Oostenrijk → excuses, korting en ticket voor de leverancier",
    "shipping_delay",
    [["send_email", "Excuusmail sturen"], ["create_ticket", "Ticket aanmaken"], [
      "notify_supplier",
      "Leverancier melden"
    ]]
  ],
  [
    "Terugbetaling boven € 250 → eerst goedkeuring van Elena, daarna Stripe en een creditnota",
    "refund_requested",
    [["require_approval", "Goedkeuring vragen"], ["stripe_refund", "Terugbetaling via Stripe"]]
  ],
  [
    "Review van één ster op een jas uit de wintercollectie → ticket met hoge prioriteit",
    "review",
    [["create_ticket", "Ticket aanmaken"], ["alert_team", "Slack #cx"]]
  ],
  [
    "Chargeback bij Klarna → bewijs ophalen en het geschil beantwoorden vóór de deadline",
    "chargeback",
    [["dispute_evidence", "Verzendbevestiging ophalen"], ["create_ticket", "Zaak openen"]]
  ],
  [
    "Voorraad van bestsellers onder de twintig stuks → leverancier vragen om na te leveren",
    "stock_low",
    [["notify_supplier", "Leverancier melden"], ["alert_team", "Team waarschuwen"]]
  ],
  [
    "Groothandelsaanvraag via het contactformulier → lead voor sales en een label op de klant",
    "email_keyword",
    [["tag_customer", "Gesprek labelen"], ["alert_team", "Lead aanmaken"]]
  ]
]

const COUNTRIES = ["NL", "BE", "DE", "FR", "AT"] as const
const EDITORS: ReadonlyArray<keyof typeof PEOPLE> = ["elena", "sofia", "ethan", "liam", "maya"]

export const BUSY: ReadonlyArray<Automation> = Array.from({ length: 30 }, (_, i) => {
  const [name, trigger, actions] = BUSY_TOPICS[i % BUSY_TOPICS.length] ?? BUSY_TOPICS[0]!
  const runs = (i * 37) % 400
  const status: FlowStatus = i % 7 === 3 ? "concept" : i % 5 === 4 ? "gepauzeerd" : "actief"
  const who = EDITORS[i % EDITORS.length] ?? "elena"
  return {
    id: `drukte-${i + 1}`,
    name: i < BUSY_TOPICS.length ? name : `${name} (${COUNTRIES[i % 5]}-winkel)`,
    description: `${name}. Draait voor de winkel in ${
      ["Nederland", "België", "Duitsland", "Frankrijk", "Oostenrijk"][i % 5]
    }.`,
    status,
    steps: [
      s("t", trigger, stepType(trigger)?.label ?? "Trigger"),
      ...actions.map(([type, summary], k) => s(`a${k}`, type, summary))
    ],
    runs: status === "concept" ? 0 : runs,
    runs30: status === "concept" ? 0 : Math.round(runs / 4),
    lastRun: status === "concept" ? null : `${22 - (i % 20)} nov`,
    owner: who,
    editedBy: who,
    editedAt: `${1 + (i % 20)} nov`,
    version: status === "concept" ? 0 : 1 + (i % 3),
    ...(status === "concept" ? { unpublished: true } : {}),
    versions: status === "concept" ? [] : [v(1, who, "1 mrt", "Eerste publicatie")],
    touches: [{ kind: "page", label: "Bestellingen", href: "/v2/bestellingen", meta: "leest de bestellingen" }],
    createdAt: "1 mrt"
  }
})

export const SEED_RUNS: ReadonlyArray<Run> = [
  ...delayRuns(),
  ...confirmRuns(),
  ...refundRuns(),
  ...feedbackRuns(),
  ...reviewRuns()
].toSorted((a, b) => a.ago - b.ago)

/* ── the library ──────────────────────────────────────────────────────────────────────────────── */

export type TemplateCategory = "bestellingen" | "klanten" | "klantenservice" | "voorraad" | "geschillen"

export const CATEGORY_LABEL: Readonly<Record<TemplateCategory, string>> = {
  bestellingen: "Bestellingen",
  klanten: "Klanten",
  klantenservice: "Klantenservice",
  voorraad: "Voorraad",
  geschillen: "Geschillen"
}

export type Template = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: TemplateCategory
  readonly steps: ReadonlyArray<Step>
  /** What Northwind's own records say this flow would have to do, or null when nothing. */
  readonly evidence: { readonly count: number; readonly line: string } | null
  /** An active flow that already does this, so it is not recommended twice. */
  readonly coveredBy?: string
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`

const onTheirWay = ORDERS.filter((o) => o.status === "verzonden").length
const vips = CUSTOMERS.filter((c) => c.lifetimeValue > 1000 && c.duplicateOf === undefined).length
const lowStock = PRODUCTS.filter((p) => p.status === "actief" && p.stock < 60).length

export const TEMPLATES: ReadonlyArray<Template> = [
  {
    id: "verzonden-track-trace",
    name: "Bestelling verzonden → track & trace-bericht",
    description:
      "Als een bestelling wordt verzonden, stuur de klant de track & trace-link, een merkfoto en de retourinstructies.",
    category: "bestellingen",
    steps: [
      s("t", "order_shipped", "Bestelling in Shopify als verzonden gemarkeerd"),
      s("a1", "klaviyo_send", "Track & trace-link · merkfoto · retourstappen")
    ],
    evidence: onTheirWay === 0
      ? null
      : { count: onTheirWay, line: `${plural(onTheirWay, "bestelling is", "bestellingen zijn")} nu onderweg.` }
  },
  {
    id: "late-levering",
    name: "Late levering → leverancier, excuses en korting",
    description:
      "Als een levering te laat is, vraag de leverancier de verzending te bevestigen, bied de klant excuses aan en geef 10% korting.",
    category: "bestellingen",
    steps: [
      s("t", "shipping_delay", "Levering later dan verwacht"),
      s("a1", "notify_supplier", "Leverancier vragen de verzending te bevestigen"),
      s("ai", "ai_compose", "Excuses in de stem van het merk"),
      s("a2", "send_email", "Excuses + kortingscode van 10%")
    ],
    evidence: late.length === 0
      ? null
      : {
        count: late.length,
        line: `${plural(late.length, "bestelling staat", "bestellingen staan")} op Vertraagd en ${
          late.length === 1 ? "wacht" : "wachten"
        } op iemand.`
      },
    coveredBy: "vertraagde-bestelling"
  },
  {
    id: "vip-bestelling",
    name: "Bestelling met hoge waarde → VIP-label en melding aan eigenaar",
    description:
      "Als een klant die veel heeft uitgegeven opnieuw bestelt, label hem als VIP en laat het de eigenaar persoonlijk weten.",
    category: "klanten",
    steps: [
      s("t", "order_placed", "Bestelling van een klant met een totale waarde boven € 1.000"),
      s("a1", "tag_customer", "Label VIP", { tag: "vip" }),
      s("a2", "alert_team", "Eigenaar laten weten", { who: "Elena Hart" })
    ],
    evidence: { count: vips, line: `${plural(vips, "klant heeft", "klanten hebben")} meer dan € 1.000 uitgegeven.` }
  },
  {
    id: "negatief-ticket",
    name: "Negatief ticket → escaleren met een voorgesteld antwoord",
    description:
      "Als een klant ontevreden klinkt, escaleer het ticket naar de CX-lead met een antwoord dat Insyte heeft opgesteld.",
    category: "klantenservice",
    steps: [
      s("t", "customer_reply", "Klant klinkt negatief"),
      s("ai1", "ai_classify", "Het sentiment lezen"),
      s("a1", "create_ticket", "Escaleren naar de CX-lead · prioriteit hoog"),
      s("ai2", "ai_compose", "Voorgesteld antwoord op het ticket")
    ],
    evidence: { count: 3, line: "3 tickets wachten langer dan 4 uur, het oudste van Felix Muller." }
  },
  {
    id: "lage-voorraad-campagne",
    name: "Lage voorraad → operations inlichten, campagne pauzeren",
    description:
      "Als een product bijna op is, laat het operations weten en pauzeer de Klaviyo-campagnes die het verkopen.",
    category: "voorraad",
    steps: [
      s("t", "stock_low", "Minder dan 60 stuks over", { threshold: "60" }),
      s("a1", "alert_team", "Operations inlichten"),
      s("a2", "klaviyo_send", "Campagnes voor dit product pauzeren")
    ],
    evidence: {
      count: lowStock,
      line: `${plural(lowStock, "actief product heeft", "actieve producten hebben")} lage voorraad of ${
        lowStock === 1 ? "is" : "zijn"
      } uitverkocht.`
    }
  },
  {
    id: "chargeback-bewijs",
    name: "Chargeback geopend → bewijs en een ticket",
    description:
      "Als er een geschil wordt geopend, koppel de bestellingen van de klant, begin aan het bewijspakket en open een ticket met de deadline.",
    category: "geschillen",
    steps: [
      s("t", "chargeback", "Geschil geopend bij de bank"),
      s("ai", "ai_link_orders", "Bestellingen van de klant koppelen"),
      s("a1", "create_ticket", "Ticket met de antwoorddeadline")
    ],
    evidence: { count: 1, line: "1 geschil staat open: CB-2291 bij Klarna, antwoord morgen om 12:00." }
  },
  {
    id: "terugbetaling-goedkeuring",
    name: "Terugbetaling aangevraagd → eerst goedkeuring",
    description:
      "Als een klant om een terugbetaling boven € 100 vraagt, houd die vast tot er goedkeuring is, voordat er iets wordt terugbetaald.",
    category: "bestellingen",
    steps: [
      s("t", "refund_requested", "Terugbetaling boven € 100 aangevraagd", { above: "€ 100" }),
      s("a1", "require_approval", "Eigenaar keurt goed", { approver: "Elena Hart" }),
      s("a2", "stripe_refund", "Terugbetalen via Stripe")
    ],
    evidence: null
  },
  {
    id: "slechte-review",
    name: "Slechte review → ticket en een persoonlijk antwoord",
    description:
      "Als er een review van een of twee sterren binnenkomt, open een ticket en stel een persoonlijk antwoord aan de reviewer op.",
    category: "klantenservice",
    steps: [
      s("t", "review", "Review van 1 of 2 sterren"),
      s("a1", "create_ticket", "Ticket voor CX"),
      s("ai", "ai_compose", "Persoonlijk antwoord aan de reviewer")
    ],
    evidence: null,
    coveredBy: "negatieve-review"
  },
  {
    id: "terugwinnen",
    name: "90 dagen geen bestelling → terugwinnen",
    description: "Als een klant 90 dagen niet heeft besteld, zet hem op de terugwinlijst in Klaviyo.",
    category: "klanten",
    steps: [
      s("t", "schedule", "Elke dag: klanten die 90 dagen niet bestelden", { when: "Elke dag om 9:00" }),
      s("a1", "klaviyo_send", "Klaviyo-terugwinlijst")
    ],
    evidence: null
  },
  {
    id: "samenvatting",
    name: "Antwoord van klant → samenvatting op het ticket",
    description:
      "Als een klant antwoordt in een open gesprek, vat het gesprek samen op het ticket, zodat wie het oppakt meteen weet waar het over gaat.",
    category: "klantenservice",
    steps: [
      s("t", "customer_reply", "Antwoord in een open gesprek"),
      s("ai", "ai_summarize", "Samenvatting op het ticket")
    ],
    evidence: null
  },
  {
    id: "levertijd-dag-5",
    name: "Levertijd-update op dag 5",
    description:
      "Elke ochtend: bestellingen die 5 dagen onderweg zijn krijgen een update met de nieuwe leverdatum, zodat de klant niet hoeft te vragen.",
    category: "bestellingen",
    steps: [
      s("t", "schedule", "Elke dag om 9:00: bestellingen die 5 dagen onderweg zijn", { when: "Elke dag om 9:00" }),
      s("ai", "ai_link_orders", "Leverdatum herberekenen"),
      s("a1", "send_email", "Levertijd-update met de nieuwe leverdatum")
    ],
    evidence: { count: 6, line: "6 bestellingen van Kestrel Goods zijn langer dan 5 dagen onderweg." }
  }
]

export const template = (id: string) => TEMPLATES.find((t) => t.id === id)

/** Whether a flow lets Insyte write or read something (an AI step). */
export const usesAi = (a: Pick<Automation, "steps">) =>
  flatSteps(a.steps).some((st) => stepType(st.type)?.kind === "ai")

/** The rights a flow's steps need, with the steps that need each. */
export function scopesOf(a: Pick<Automation, "steps">): ReadonlyMap<Scope, ReadonlyArray<string>> {
  const out = new Map<Scope, Array<string>>()
  for (const st of flatSteps(a.steps)) {
    const scope = stepType(st.type)?.scope
    if (scope === undefined) continue
    out.set(scope, [...(out.get(scope) ?? []), st.summary])
  }
  return out
}

/** The services a flow runs through besides Insyte: "Klaviyo", "Resend, Stripe". */
export const viaOf = (a: Pick<Automation, "steps">) => [
  ...new Set(
    flatSteps(a.steps).flatMap((st) => {
      const via = stepType(st.type)?.via
      return via === undefined ? [] : [via]
    })
  )
]

/** The templates worth setting up: Northwind's records say they have work, and no active flow does it. */
export const recommended = (flows: ReadonlyArray<Automation>) =>
  TEMPLATES.filter((t) => t.evidence !== null && flows.find((a) => a.id === t.coveredBy)?.status !== "actief")

/**
 * The counts the menu and the page both show, from one function so they agree: all flows, drafts,
 * flows with an AI step, runs in the history, the library and what is recommended.
 */
export function automationCounts(flows: ReadonlyArray<Automation>, runs: ReadonlyArray<Run>) {
  return {
    all: flows.length,
    active: flows.filter((a) => a.status === "actief").length,
    paused: flows.filter((a) => a.status === "gepauzeerd").length,
    drafts: flows.filter((a) => a.status === "concept").length,
    ai: flows.filter(usesAi).length,
    history: runs.length,
    failed: runs.filter((r) => r.status === "mislukt").length,
    templates: TEMPLATES.length,
    recommended: recommended(flows).length
  }
}
