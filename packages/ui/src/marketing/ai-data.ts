/*
 * What Vraag Insyte and Analyse say on the demo workspace, copied — not imported — from the console.
 *
 * Read off the live console on the settled persona (`?scenario=settled`) on 31 October 2026:
 * - the three turns are `scriptFor()` in `packages/ui/src/app/lib/ask/scripts.ts` (summary, delays,
 *   reply), exactly as /ask renders them: steps, tools, answer, sources, proposal, follow-ups;
 * - the figures, findings and the supplier answer are `packages/ui/src/app/lib/analytics/engine.ts` and
 *   `lib/analytics/ask.ts`, as /analytics renders them for "mei tot nu toe" against April. The
 *   workspace's history is in US dollars, so the figures are too.
 * The console says of its own Ask: answers in the demo are scripted from the workspace on screen.
 * The landing says the same under the demo.
 */

export type RefKind = "order" | "chargeback" | "customer" | "supplier" | "queue"

/** A word, or a record shown as a chip. */
type Token = { readonly t: string } | { readonly ref: string; readonly kind: RefKind }

const say = (text: string): ReadonlyArray<Token> => {
  const out: Token[] = []
  for (const part of text.split(/(\[\[[^\]]+\]\])/)) {
    const m = /^\[\[([^|]+)\|([a-z]+)\]\]$/.exec(part)
    if (m) out.push({ ref: m[1] ?? "", kind: (m[2] ?? "order") as RefKind })
    else for (const w of part.split(/\s+/)) if (w !== "") out.push({ t: w })
  }
  return out
}

export type Turn = {
  readonly id: string
  readonly question: string
  readonly steps: ReadonlyArray<string>
  readonly tools: ReadonlyArray<string>
  readonly answer: ReadonlyArray<Token>
  readonly sources: ReadonlyArray<{ readonly kind: RefKind; readonly title: string; readonly detail: string }>
  readonly proposal: {
    readonly title: string
    readonly body: string
    readonly confidence: number
    readonly why: string
    readonly fileLabel: string
  }
  readonly followUps: ReadonlyArray<string>
}

export const TURNS: ReadonlyArray<Turn> = [
  {
    id: "summary",
    question: "Vat de open zaken van vandaag samen",
    steps: [
      "Wachtrij van vandaag lezen",
      "Deadlines van open zaken controleren",
      "De rest groeperen op wie moet handelen"
    ],
    tools: ["Las 10 wachtrijregels", "Las 2 open zaken", "Las 8 vertraagde bestellingen"],
    answer: say(
      "6 zaken wachten op jou voordat de dag om is. De zaak met een deadline is [[DSP-2214|chargeback]]: het bewijs voor Klarna moet om 18:00 binnen zijn en het bewijspakket is al verzameld. Verder zijn er 8 vertraagde bestellingen, de meeste bij [[Skyway Freight|supplier]], en staan er nog 2 tickets met hoge prioriteit open op het bord."
    ),
    sources: [
      { kind: "queue", title: "Wachtrij van vandaag", detail: "6 wachten op jou" },
      { kind: "chargeback", title: "DSP-2214 · Klarna", detail: "Bewijs uiterlijk 18:00" },
      { kind: "supplier", title: "Skyway Freight", detail: "8 vertraagd" }
    ],
    proposal: {
      title: "Klarna-bewijs voor DSP-2214 indienen",
      body:
        "Vier documenten verzameld: de scan van de vervoerder, de bezorgfoto, twee antwoorden van de klant en de oorspronkelijke factuur.",
      confidence: 92,
      why: "Klarna heeft dit jaar elke zaak met een scan van de vervoerder in het voordeel van de verkoper beslist.",
      fileLabel: "Bewijs indienen"
    },
    followUps: [
      "Welke bestellingen dreigen te laat te komen?",
      "Stel een antwoord op aan Daniel over zijn vertraagde levering"
    ]
  },
  {
    id: "delays",
    question: "Welke bestellingen dreigen te laat te komen?",
    steps: [
      "Bestellingen voorbij hun overdrachtsdatum zoeken",
      "Elke bestelling aan haar leverancier koppelen",
      "Leveranciers rangschikken op aantal"
    ],
    tools: ["Las 60 bestellingen", "Koppelde 1 leverancier"],
    answer: say(
      "8 bestellingen dreigen te laat te komen. [[Skyway Freight|supplier]] heeft er 8 van, waaronder [[SO-12200|order]], [[SO-12208|order]], [[SO-12216|order]]. Geen ervan heeft al een nieuwe overdrachtsdatum, dus de klanten weten nog van niets."
    ),
    sources: [
      { kind: "supplier", title: "Skyway Freight", detail: "8 vertraagd" },
      { kind: "order", title: "SO-12200", detail: "Voorbij overdracht" },
      { kind: "order", title: "SO-12208", detail: "Voorbij overdracht" },
      { kind: "order", title: "SO-12216", detail: "Voorbij overdracht" }
    ],
    proposal: {
      title: "Vraag Skyway Freight om nieuwe overdrachtsdata",
      body: "Eén follow-up voor alle 8 bestellingen, geopend als ticket zodat het antwoord op het bord terechtkomt.",
      confidence: 84,
      why: "Skyway Freight beantwoordde de laatste drie follow-ups binnen een dag.",
      fileLabel: "Ticket openen"
    },
    followUps: ["Stel een antwoord op aan Daniel over zijn vertraagde levering", "Vat de open zaken van vandaag samen"]
  },
  {
    id: "reply",
    question: "Stel een antwoord op aan Daniel over zijn vertraagde levering",
    steps: [
      "Daniels laatste twee berichten lezen",
      "Nagaan waar zijn bestelling is",
      "Schrijven in de toon van de winkel"
    ],
    tools: ["Las 2 berichten", "Las 1 track & trace-update"],
    answer: say(
      "Daniel schreef twee keer over [[SO-12224|order]]. De bestelling ligt bij de vervoerder, een dag achter, en er valt nog geen terugbetaling aan te bieden omdat ze niet kwijt is. Hier is een antwoord dat dat zegt zonder een datum te beloven."
    ),
    sources: [
      { kind: "customer", title: "Daniel Okafor", detail: "2 berichten, laatste 3 uur geleden" },
      { kind: "order", title: "SO-12224", detail: "Bij de vervoerder" }
    ],
    proposal: {
      title: "Daniel beantwoorden",
      body:
        "Hoi Daniel, bedankt voor je geduld. Je bestelling is later dan gepland bij onze leverancier vertrokken en ligt nu bij de vervoerder. De track & trace wordt binnen een dag bijgewerkt en ik laat het je weten zodra dat gebeurt.",
      confidence: 78,
      why:
        "Klanten die over een vertraging hoorden voordat ze ernaar vroegen, openden vorig kwartaal minder geschillen.",
      fileLabel: "Antwoord versturen"
    },
    followUps: ["Welke bestellingen dreigen te laat te komen?", "Welke chargebacks hebben bewijs nodig?"]
  }
]

/** /analytics, "mei tot nu toe" against April: the six figures of the plate. */
export const FIGURES: ReadonlyArray<{
  readonly label: string
  readonly value: string
  readonly change: string
  readonly up: boolean
  readonly was: string
}> = [
  { label: "Omzet", value: "€ 165.050", change: "7,6%", up: true, was: "was € 153.395" },
  { label: "Betaalde bestellingen", value: "1.594", change: "5,7%", up: true, was: "was 1.508" },
  { label: "Op tijd", value: "92,4%", change: "0,1 pp", up: false, was: "was 92,5%" },
  { label: "Terugbetaald", value: "4,2%", change: "0,9 pp", up: true, was: "was 3,3%" },
  { label: "Geschillen", value: "10", change: "5", up: true, was: "was 5" },
  { label: "Uren tot opgelost", value: "5,5 u", change: "1,9%", up: true, was: "was 5,4 u" }
]

/** "Wat Insyte vond": the six findings, and whether each is fine or needs a look. */
export const FINDINGS: ReadonlyArray<{ readonly title: string; readonly look: boolean }> = [
  { title: "Omzet", look: false },
  { title: "Levering op tijd", look: true },
  { title: "Terugbetalingen", look: true },
  { title: "Groei", look: false },
  { title: "Geschillen", look: true },
  { title: "Klantenservice", look: true }
]

export const REVENUE_FINDING =
  "De omzet steeg met 7,6% naar € 165.050. De grootste verschuiving is Aurora fleece met capuchon in Northwind EU, +€ 4.806."

/** "Vraag ernaar" on /analytics: the supplier question, its steps and its answer. */
export const SUPPLIER_ANSWER = {
  question: "Welke leverancier is het vaakst te laat?",
  steps: ["De leveringen gelezen", "Elke levering naast de beloofde datum gelegd", "De leveranciers gerangschikt"],
  answer:
    "Kestrel Goods is het vaakst te laat: in 1–26 mei kwam 13,1% van de pakketten na de beloofde datum aan, tegenover 8,2% in 1–26 april. 31 van de 42 te late pakketten gingen naar Duitsland.",
  rows: [
    { label: "Kestrel Goods", value: 13.1 },
    { label: "Allure Fulfillment", value: 6.3 },
    { label: "DPC Apparel", value: 6.1 }
  ]
} as const

/* Daily revenue, 1–26 May against 1–26 April, in thousands of dollars, and Insyte's estimate for
   27–31 May: the shape of the console's chart, scaled to its totals (about € 6,3k a day, shown in euros like the rest of the landing). */
export const MAY = [
  5.6,
  6.8,
  6.4,
  6.7,
  5.9,
  6.1,
  6.1,
  6.6,
  6.7,
  7.4,
  6.6,
  5.6,
  6.6,
  6.5,
  5.8,
  6.5,
  7.3,
  6.3,
  5.8,
  6.4,
  6.2,
  5.9,
  8.6,
  6.2,
  6.6,
  6.3
] as const
export const APRIL = [
  6.1,
  6.0,
  5.4,
  6.3,
  7.0,
  6.2,
  6.0,
  5.9,
  6.3,
  5.9,
  6.2,
  6.0,
  5.8,
  6.4,
  5.6,
  6.2,
  5.9,
  5.5,
  6.0,
  6.3,
  6.1,
  5.7,
  6.0,
  6.0,
  6.4,
  6.6
] as const
export const ESTIMATE = { mid: 6.3, low: 5.4, high: 7.2 } as const
