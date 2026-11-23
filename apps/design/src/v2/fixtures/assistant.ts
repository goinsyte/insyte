import type { BarData } from "../charts/types.ts"
import { BLOCKS } from "./analytics.ts"

/**
 * Magnus's demo conversations. Answers are scripted; a follow-up chip either asks a further question
 * (and gets a scripted answer) or brings a proposal, which is what an _Eerst vragen_ action looks like.
 */

export type Step = { readonly label: string; readonly read?: string }

export type Turn =
  | { readonly from: "me"; readonly at: string; readonly text: string }
  | {
    readonly from: "magnus"
    readonly at: string
    readonly steps?: ReadonlyArray<Step>
    readonly paragraphs: ReadonlyArray<string>
    /** What "Opnieuw genereren" streams instead: the same facts, put another way. */
    readonly alternative?: ReadonlyArray<string>
    readonly chart?: { readonly title: string; readonly data: BarData; readonly kind: "bar" | "rank" }
    readonly closing?: string
    readonly followUps?: ReadonlyArray<FollowUp>
  }

export type FollowUp =
  | { readonly id: string; readonly label: string; readonly kind: "question" }
  | { readonly id: string; readonly label: string; readonly kind: "proposal"; readonly proposal: Proposal }

export type Proposal = {
  readonly title: string
  readonly body: string
  readonly where: string
  readonly rule: "Eerst vragen"
  /** What will be set, as written: what Bewerken opens. */
  readonly draft?: string
}

export type Chat = {
  readonly id: string
  readonly title: string
  readonly started: string
  readonly turns: ReadonlyArray<Turn>
  /** Scripted answers to the follow-ups that are questions, by follow-up id. */
  readonly answers?: Readonly<Record<string, Turn>>
}

const refunds = BLOCKS.terugbetalingenPerProduct.data

export const CHATS: ReadonlyArray<Chat> = [
  {
    id: "terugbetalingen",
    title: "Waarom stegen de terugbetalingen?",
    started: "vandaag",
    turns: [
      { from: "me", at: "14:21", text: "Waarom zijn de terugbetalingen afgelopen week omhoog gegaan?" },
      {
        from: "magnus",
        at: "14:21",
        steps: [
          { label: "Terugbetalingen van de afgelopen twee weken gelezen", read: "Shopify · 71 terugbetalingen" },
          { label: "Per product gegroepeerd" },
          { label: "Retourredenen gelezen", read: "Retourformulieren · 41" },
          { label: "Verkochte maten vergeleken met teruggestuurde maten" },
          { label: "Klantvragen over de Aurora doorzocht", read: "Inbox · 9 tickets" },
          { label: "Maattabel van de Aurora vergeleken met de levering", read: "Allure Fulfillment · 2 okt" }
        ],
        paragraphs: [
          "De terugbetalingen stegen afgelopen week met **37%**: **41** tegen **30** de week ervoor.",
          "**26** daarvan gaan over de **Aurora Hooded Fleece in maat S**, en **21** daarvan zeggen dat hij te klein valt. Sinds de levering van 2 oktober valt de S 2 cm smaller dan de maattabel. De andere producten zitten op het niveau van de week ervoor."
        ],
        alternative: [
          "Kort gezegd: het komt door één product. Van de **41** terugbetalingen (tegen **30** de week ervoor, **+37%**) zijn er **26** voor de **Aurora Hooded Fleece in S**.",
          "**21** klanten schrijven dat hij te klein valt, en dat klopt: de S van de levering van 2 oktober meet 2 cm minder dan de maattabel zegt. Zonder de Aurora waren de terugbetalingen gelijk gebleven."
        ],
        chart: { title: "Terugbetalingen per product, afgelopen week", data: refunds, kind: "bar" },
        closing:
          "Zal ik de oorzaak aanpakken? Ik kan een maatadvies op de Aurora zetten en de retouragent eerst een omruiling laten aanbieden voordat hij terugbetaalt.",
        followUps: [
          {
            id: "maatadvies",
            label: "Maatadvies op de Aurora zetten",
            kind: "proposal",
            proposal: {
              title: "Maatadvies op de productpagina van de Aurora Hooded Fleece",
              body:
                "‘Valt klein: kies één maat groter dan je gewoonlijk draagt.’ Onder de maatkeuze, in de twee gekoppelde winkels (EU en US).",
              where: "Shopify · productpagina",
              rule: "Eerst vragen",
              draft: "Valt klein: kies één maat groter dan je gewoonlijk draagt."
            }
          },
          {
            id: "omruilen",
            label: "Eerst omruilen aanbieden, dan terugbetalen",
            kind: "proposal",
            proposal: {
              title: "Retouragent: bij ‘valt te klein’ eerst een maat groter aanbieden",
              body:
                "Geldt voor de Aurora Hooded Fleece zolang de maattabel niet klopt. Wil de klant toch zijn geld terug, dan betaalt de agent terug zoals nu.",
              where: "Retouragent · instructies",
              rule: "Eerst vragen"
            }
          },
          { id: "vervoerder", label: "Terugbetalingen per vervoerder tonen", kind: "question" }
        ]
      }
    ],
    answers: {
      vervoerder: {
        from: "magnus",
        at: "14:24",
        paragraphs: [
          "**PostNL** heeft de meeste terugbetalingen, **18** van de **41**, maar vervoert ook bijna de helft van de pakketten. Geen vervoerder zit ver boven zijn deel van de zendingen: de stijging komt van de Aurora, niet van een vervoerder."
        ],
        alternative: [
          "De vervoerder is het niet. **PostNL** telt de meeste terugbetalingen (**18** van **41**), maar brengt ook bijna de helft van alle pakketten; DHL en DPD zitten net als PostNL op hun deel van de zendingen."
        ],
        chart: {
          title: "Terugbetalingen per vervoerder, afgelopen week",
          data: BLOCKS.perVervoerder.data,
          kind: "rank"
        }
      }
    }
  },
  {
    id: "bestsellers",
    title: "Bestverkochte jassen in oktober",
    started: "gisteren",
    turns: [
      { from: "me", at: "09:12", text: "Welke jassen verkochten het best in oktober?" },
      {
        from: "magnus",
        at: "09:12",
        paragraphs: [
          "De **Coastline Bomber Jacket** verkocht het best: **412** stuks, **€ 32.548** omzet. Daarna de **Harbor Raincoat** met **268** en de **Aurora Hooded Fleece** met **251**."
        ],
        alternative: [
          "Nummer één in oktober: de **Coastline Bomber Jacket**, **412** stuks voor **€ 32.548**. De **Harbor Raincoat** (**268**) en de **Aurora Hooded Fleece** (**251**) volgen op ruime afstand."
        ]
      }
    ]
  },
  {
    id: "geschil",
    title: "Antwoord op het Aurora-geschil",
    started: "18 nov",
    turns: [
      { from: "me", at: "16:40", text: "Schrijf een antwoord op het Klarna-geschil van bestelling #5318." },
      {
        from: "magnus",
        at: "16:41",
        paragraphs: [
          "Hier is het concept. Het bewijspakket bevat de track & trace van PostNL (bezorgd op 12 nov om 11:04), de foto bij aflevering en de chat waarin de klant de maat bevestigde."
        ]
      }
    ]
  },
  {
    id: "retouragent",
    title: "De retouragent instellen",
    started: "14 nov",
    turns: [
      { from: "me", at: "11:02", text: "Help me een agent te maken die retourvragen afhandelt." },
      {
        from: "magnus",
        at: "11:03",
        paragraphs: [
          "De **Retouragent** staat klaar. Hij beantwoordt retourvragen in de inbox, maakt het retourlabel aan en vraagt jou eerst voordat hij terugbetaalt."
        ]
      }
    ]
  }
]

/** What a new chat suggests, before anything is typed. */
export const SUGGESTIONS = [
  "Wat moet ik vandaag als eerste doen?",
  "Welke leverancier haalt zijn levertijd niet?",
  "Vat de week samen voor het team"
] as const
