import type { TicketTemplate, TicketTopic } from "./Tickets.ts"

/*
 * What the tickets slice decides by rule (M11 step 3): a ticket's topic from its words, the templates every workspace
 * starts with, and the labels the menus offer before the team has used any of its own.
 */

/** Keywords per topic, tried in this order; the first that matches wins. Lower case, Dutch and English. */
const TOPIC_WORDS: ReadonlyArray<readonly [TicketTopic, RegExp]> = [
  ["returns", /retour|terugsturen|terug\s?sturen|ruilen|omruilen|terugbetal|refund|return/],
  ["sizing", /maat|maten|te klein|te groot|size|sizing|past niet/],
  ["payment", /betaling|betaal|betaald|factuur|klarna|ideal|afgeschreven|chargeback|geschil|payment|invoice/],
  [
    "where_is_my_order",
    /waar is|bestelling|pakket|levering|bezorg|verzend|track|vertraag|niet ontvangen|shipping|delivery/
  ],
  ["product_question", /product|voorraad|kleur|materiaal|stof|werkt niet|kapot|vraag over|stock/]
]

/** The topic a ticket's title and description point at, or `null` where none does. */
export const topicOf = (title: string, description: string): TicketTopic | null => {
  const text = `${title} ${description}`.toLowerCase()
  return TOPIC_WORDS.find(([, words]) => words.test(text))?.[0] ?? null
}

/** The three tickets an operator writes most, as the design's split button offers them. */
export const SYSTEM_TEMPLATES: ReadonlyArray<TicketTemplate> = [
  {
    id: "refund_request",
    label: "Verzoek om terugbetaling",
    title: "Verzoek om terugbetaling · ",
    description:
      "De klant vraagt om een terugbetaling. Controleer of de bestelling binnen de retourtermijn valt en of het artikel terug is, betaal dan terug en antwoord de klant.",
    priority: "medium",
    labels: ["Terugbetaling"]
  },
  {
    id: "supplier_escalation",
    label: "Escalatie naar leverancier",
    title: "Vertraging bij leverancier · ",
    description:
      "Een bestelling is over de overdrachtsdatum heen. Vraag de leverancier om een verzenddatum en track & trace, en laat het de klant weten zodra je die hebt.",
    priority: "high",
    labels: ["Leverancier"]
  },
  {
    id: "customer_feedback",
    label: "Feedback van klant",
    title: "Feedback van klant · ",
    description:
      "Feedback die het doorgeven waard is. Noteer wat er gezegd is, waar, en wie in het team het moet zien.",
    priority: "low",
    labels: ["Feedback"]
  }
]

/** The labels the menus offer from the first day, as the design lists them; the team's own follow in use. */
export const DEFAULT_LABELS: ReadonlyArray<string> = [
  "Productontwerp",
  "Klantenservice",
  "Leveringsketen",
  "Feedback",
  "Bestelbevestiging",
  "Opgelost",
  "Vertaling",
  "Terugbetalingen",
  "Geschillen"
]
