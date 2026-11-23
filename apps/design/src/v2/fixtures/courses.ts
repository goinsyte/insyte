import type { PEOPLE } from "./workspace.ts"

/**
 * Cursussen: how Northwind teaches its team. Rebuilt from the current demo's `mock-data/courses.ts`
 * (PLAN 39) on this version's team: three chapters, seven courses (one draft, one archived), progress
 * for the people besides Elena, and two questions, one still open. Amber from the original is not on
 * this version's team, so her progress and her open question are Maya's. Dates are fixed around
 * Monday 23 November, the demo's today.
 */

export type PersonKey = keyof typeof PEOPLE

export type Block =
  | { readonly id: string; readonly kind: "text"; readonly title: string; readonly body: string }
  | { readonly id: string; readonly kind: "video"; readonly title: string; readonly minutes: number }
  | { readonly id: string; readonly kind: "image"; readonly title: string; readonly caption: string }
  | {
    readonly id: string
    readonly kind: "quiz"
    readonly question: string
    readonly options: ReadonlyArray<string>
    readonly correct: number
    readonly explain: string
  }

export type BlockKind = Block["kind"]
export const BLOCK_LABEL: Readonly<Record<BlockKind, string>> = {
  text: "Tekst",
  video: "Video",
  image: "Afbeelding",
  quiz: "Vraag"
}

export type Badge = "star" | "shield" | "parcel" | "chat" | "flag" | "key"
export const BADGE_LABEL: Readonly<Record<Badge, string>> = {
  star: "Ster",
  shield: "Schild",
  parcel: "Pakket",
  chat: "Gesprek",
  flag: "Vlag",
  key: "Sleutel"
}

export type CourseStatus = "live" | "concept" | "archief"
export type Audience = { readonly kind: "all" } | {
  readonly kind: "some"
  readonly roles: ReadonlyArray<string>
  readonly people: ReadonlyArray<PersonKey>
}

export type Chapter = {
  readonly id: string
  readonly title: string
  readonly modules: ReadonlyArray<{ readonly id: string; readonly title: string }>
}

export type Course = {
  readonly id: string
  readonly title: string
  readonly chapterId: string
  readonly moduleId: string
  readonly description: string
  readonly status: CourseStatus
  readonly audience: Audience
  readonly badge: Badge
  /** "2 dec"; overdue when `overdue` is set. */
  readonly deadline?: string
  readonly overdue?: boolean
  readonly passMark: number
  readonly order: "vrij" | "vast"
  readonly questions: boolean
  /** Supplier ids that also follow it (`fixtures/records.ts`). */
  readonly suppliers: ReadonlyArray<string>
  readonly author: PersonKey
  readonly updated: string
  readonly blocks: ReadonlyArray<Block>
}

export type Progress = {
  readonly courseId: string
  readonly person: PersonKey
  /** Blocks done, from the start. */
  readonly done: number
  readonly score?: number
  readonly attempts: number
  readonly finished?: string
  readonly started: string
}

export type Question = {
  readonly id: string
  readonly courseId: string
  readonly person: PersonKey
  readonly blockId: string
  readonly text: string
  readonly at: string
  readonly answer?: string
  readonly answeredBy?: string
}

const text = (id: string, title: string, body: string): Block => ({ id, kind: "text", title, body })
const quiz = (
  id: string,
  question: string,
  options: ReadonlyArray<string>,
  correct: number,
  explain: string
): Block => ({
  id,
  kind: "quiz",
  question,
  options,
  correct,
  explain
})

export const CHAPTERS: ReadonlyArray<Chapter> = [
  {
    id: "service",
    title: "Klantenservice",
    modules: [{ id: "basis", title: "De basis" }, { id: "lastig", title: "Lastige gesprekken" }]
  },
  {
    id: "ops",
    title: "Bestellingen en leveranciers",
    modules: [{ id: "doorsturen", title: "Doorsturen" }, { id: "retour", title: "Retouren en chargebacks" }]
  },
  { id: "insyte", title: "Werken in Insyte", modules: [{ id: "start", title: "Je eerste week" }] }
]

const base = { order: "vrij", suppliers: [], passMark: 80, questions: true, author: "elena" } as const

export const COURSES: ReadonlyArray<Course> = [
  {
    ...base,
    id: "zo-antwoorden-we",
    title: "Zo antwoorden we klanten",
    chapterId: "service",
    moduleId: "basis",
    description: "De toon van Northwind, hoe snel we reageren en wat er in elk antwoord moet staan.",
    status: "live",
    audience: { kind: "all" },
    badge: "chat",
    updated: "11 nov",
    blocks: [
      text(
        "ant-1",
        "Onze toon",
        "We schrijven zoals we praten: kort, vriendelijk en met je voornaam eronder. Geen 'Geachte klant', geen excuses in drie zinnen.\n\nBegin met het antwoord op de vraag. De uitleg komt daarna, als die nodig is."
      ),
      { id: "ant-2", kind: "video", title: "Een goed antwoord, stap voor stap", minutes: 4 },
      text(
        "ant-3",
        "Hoe snel",
        "Een e-mail beantwoorden we binnen 4 werkuren. Op de websitechat reageert de klantagent meteen; neem je het over, dan binnen 2 minuten.\n\nLukt het niet binnen die tijd, stuur dan een kort bericht dat je ermee bezig bent."
      ),
      quiz(
        "ant-4",
        "Binnen hoeveel werkuren beantwoorden we een e-mail?",
        ["Binnen 1 werkuur", "Binnen 4 werkuren", "Binnen 24 uur"],
        1,
        "Binnen 4 werkuren. Lukt dat niet, dan sturen we een kort bericht dat we ermee bezig zijn."
      ),
      text(
        "ant-5",
        "Wat er altijd in staat",
        "- Het bestelnummer, zodat de klant weet waar het over gaat\n- Wat er nu gebeurt, en wanneer\n- Je voornaam"
      ),
      quiz(
        "ant-6",
        "Hoe begin je een antwoord?",
        ["Met een excuus", "Met het antwoord op de vraag", "Met 'Geachte klant'"],
        1,
        "Met het antwoord. De uitleg komt daarna, als die nodig is."
      )
    ]
  },
  {
    ...base,
    id: "boze-klant",
    title: "Een boze klant kalmeren",
    chapterId: "service",
    moduleId: "lastig",
    description: "Wat je zegt als een pakket te laat is en de klant al twee keer heeft gemaild.",
    status: "live",
    audience: { kind: "some", roles: ["Klantenservice", "CX-lead"], people: [] },
    badge: "shield",
    deadline: "2 dec",
    updated: "15 nov",
    author: "sofia",
    blocks: [
      text(
        "boos-1",
        "Eerst erkennen",
        "Zeg wat er misging, in je eigen woorden: 'Je pakket had er dinsdag moeten zijn en het is er nog niet.' Dat is geen schuld bekennen, dat is laten zien dat je het gelezen hebt."
      ),
      text(
        "boos-2",
        "Dan iets doen",
        "Kijk in de bestelling waar het pakket is. Is het langer dan 5 werkdagen onderweg, bied dan een nieuw pakket of je geld terug aan. Een terugbetaling vraagt Insyte altijd eerst aan jou."
      ),
      {
        id: "boos-3",
        kind: "image",
        title: "Waar je de track & trace vindt",
        caption: "In de bestelling, onder Verzending. De laatste scan staat bovenaan."
      },
      quiz(
        "boos-4",
        "Na hoeveel werkdagen onderweg bied je een nieuw pakket aan?",
        ["Na 2 werkdagen", "Na 5 werkdagen", "Na 10 werkdagen"],
        1,
        "Na 5 werkdagen onderweg bied je een nieuw pakket of je geld terug aan."
      )
    ]
  },
  {
    ...base,
    id: "doorsturen",
    title: "Een bestelling doorsturen naar de leverancier",
    chapterId: "ops",
    moduleId: "doorsturen",
    description: "Van betaalde bestelling tot bevestiging van de leverancier, en wat je doet als een artikel op is.",
    status: "live",
    order: "vast",
    audience: { kind: "some", roles: ["Operations"], people: ["sofia"] },
    suppliers: ["allure-fulfillment"],
    badge: "parcel",
    updated: "18 nov",
    blocks: [
      text(
        "door-1",
        "De wachtrij",
        "Onder Bestellingen → Te versturen staat alles wat betaald is en nog niet bij een leverancier ligt. Insyte kiest de leverancier per regel; jij controleert en verstuurt."
      ),
      text(
        "door-2",
        "Wachten op bevestiging",
        "Een leverancier bevestigt binnen 24 uur. Daarna zet Insyte de bestelling bij Wacht op bevestiging en stuurt het één herinnering."
      ),
      quiz(
        "door-3",
        "Binnen hoeveel uur bevestigt een leverancier?",
        ["Binnen 4 uur", "Binnen 24 uur", "Binnen 72 uur"],
        1,
        "Binnen 24 uur. Daarna stuurt Insyte één herinnering."
      ),
      text(
        "door-4",
        "Uitverkocht",
        "Meldt de leverancier dat een artikel op is, dan kies je een andere leverancier of je mailt de klant met een alternatief. Annuleren doe je pas als de klant dat wil."
      )
    ]
  },
  {
    ...base,
    id: "chargebacks-bewijs",
    title: "Chargebacks: bewijs verzamelen",
    chapterId: "ops",
    moduleId: "retour",
    description: "Welk bewijs Klarna en Shopify Payments willen zien, en hoe Insyte het pakket voor je klaarzet.",
    status: "live",
    audience: { kind: "some", roles: ["CX-lead", "Eigenaar"], people: ["liam"] },
    badge: "key",
    updated: "20 nov",
    blocks: [
      text(
        "cb-1",
        "Wat telt als bewijs",
        "- De track & trace met de bezorgscan\n- De mails met de klant over deze bestelling\n- De productpagina zoals die was op de dag van de bestelling\n\nInsyte zet dit klaar als bewijspakket. Indienen doe jij: dat kan niet terug."
      ),
      quiz(
        "cb-2",
        "Wie dient het bewijs in bij Klarna?",
        ["Insyte, zelf", "Jij, na controle", "De klant"],
        1,
        "Jij. Indienen kan niet terug, dus Insyte vraagt het altijd eerst."
      ),
      text(
        "cb-3",
        "De termijn",
        "Je hebt meestal 7 dagen om bewijs in te dienen. De deadline staat bij elke chargeback; Insyte waarschuwt 2 dagen ervoor."
      )
    ]
  },
  {
    ...base,
    id: "eerste-week",
    title: "Je eerste week in Insyte",
    chapterId: "insyte",
    moduleId: "start",
    description: "Waar je begint als je inlogt, wat Insyte zelf doet en waar je dat terugziet.",
    status: "live",
    order: "vast",
    audience: { kind: "all" },
    badge: "flag",
    deadline: "21 nov",
    overdue: true,
    passMark: 70,
    updated: "29 okt",
    blocks: [
      text(
        "ew-1",
        "Dashboard",
        "Als je inlogt staat bovenaan wat op jou wacht. Daaronder wat Insyte heeft voorbereid en wil voorleggen."
      ),
      { id: "ew-2", kind: "video", title: "Een rondje door Insyte", minutes: 6 },
      text(
        "ew-3",
        "Wat Insyte zelf doet",
        "Insyte zet statussen, wijst tickets toe en schrijft notities zonder te vragen. Alles wat geld kost of namens de winkel spreekt, legt het eerst aan jou voor. Onder Vraag Insyte → Wat Insyte deed zie je alles terug, en veel kun je 5 minuten lang terugdraaien."
      ),
      quiz(
        "ew-4",
        "Hoe lang kun je een actie van Insyte terugdraaien?",
        ["1 minuut", "5 minuten", "Een dag"],
        1,
        "5 minuten, voor alles wat terug kan."
      )
    ]
  },
  {
    ...base,
    id: "retouren-beoordelen",
    title: "Retouren beoordelen",
    chapterId: "ops",
    moduleId: "retour",
    description: "",
    status: "concept",
    audience: { kind: "some", roles: ["Klantenservice"], people: [] },
    badge: "parcel",
    updated: "gisteren 15:00",
    author: "sofia",
    blocks: [
      text(
        "ret-1",
        "De termijn",
        "Een retour kan binnen 30 dagen na bezorging, een claim binnen 60 dagen. Sale-artikelen nemen we niet terug."
      ),
      quiz("ret-2", "", ["", "", ""], 0, "")
    ]
  },
  {
    ...base,
    id: "toon-2025",
    title: "Toon en stijl (2025)",
    chapterId: "service",
    moduleId: "basis",
    description: "De oude schrijfwijzer, voor we 'je' gingen zeggen.",
    status: "archief",
    audience: { kind: "all" },
    badge: "star",
    updated: "14 sep",
    blocks: [text("oud-1", "U of je", "We spraken klanten aan met u. Sinds januari zeggen we je.")]
  }
]

export const PROGRESS: ReadonlyArray<Progress> = [
  {
    courseId: "zo-antwoorden-we",
    person: "elena",
    done: 6,
    score: 100,
    attempts: 1,
    finished: "15 okt",
    started: "15 okt"
  },
  { courseId: "eerste-week", person: "elena", done: 4, score: 100, attempts: 1, finished: "26 sep", started: "26 sep" },
  {
    courseId: "zo-antwoorden-we",
    person: "sofia",
    done: 6,
    score: 100,
    attempts: 1,
    finished: "24 okt",
    started: "24 okt"
  },
  { courseId: "boze-klant", person: "sofia", done: 4, score: 100, attempts: 1, finished: "17 nov", started: "16 nov" },
  { courseId: "eerste-week", person: "sofia", done: 4, score: 100, attempts: 1, finished: "4 okt", started: "4 okt" },
  { courseId: "doorsturen", person: "sofia", done: 2, attempts: 0, started: "21 nov" },
  {
    courseId: "chargebacks-bewijs",
    person: "sofia",
    done: 3,
    score: 100,
    attempts: 1,
    finished: "14 nov",
    started: "14 nov"
  },
  {
    courseId: "zo-antwoorden-we",
    person: "ethan",
    done: 6,
    score: 50,
    attempts: 2,
    finished: "11 nov",
    started: "9 nov"
  },
  { courseId: "doorsturen", person: "ethan", done: 4, score: 100, attempts: 1, finished: "19 nov", started: "19 nov" },
  { courseId: "eerste-week", person: "ethan", done: 2, attempts: 0, started: "8 nov" },
  { courseId: "zo-antwoorden-we", person: "liam", done: 3, attempts: 0, started: "19 nov" },
  { courseId: "doorsturen", person: "liam", done: 4, score: 100, attempts: 1, finished: "20 nov", started: "20 nov" },
  { courseId: "eerste-week", person: "liam", done: 4, score: 100, attempts: 1, finished: "3 nov", started: "3 nov" },
  {
    courseId: "zo-antwoorden-we",
    person: "maya",
    done: 6,
    score: 100,
    attempts: 1,
    finished: "16 nov",
    started: "16 nov"
  },
  { courseId: "boze-klant", person: "maya", done: 1, attempts: 0, started: "22 nov" }
]

export const QUESTIONS: ReadonlyArray<Question> = [
  {
    id: "vraag-1",
    courseId: "boze-klant",
    person: "maya",
    blockId: "boos-2",
    text: "Geldt die 5 werkdagen ook voor pakketten naar Duitsland? Die doen er vaak langer over.",
    at: "gisteren 11:00"
  },
  {
    id: "vraag-2",
    courseId: "zo-antwoorden-we",
    person: "ethan",
    blockId: "ant-3",
    text: "Tellen werkuren ook op zaterdag?",
    at: "12 nov",
    answer: "Nee, alleen maandag tot en met vrijdag, 9:00 tot 17:30.",
    answeredBy: "Elena Hart"
  }
]

/** The busy week: a long chapter of long-titled courses. */
export const BUSY_CHAPTER: Chapter = {
  id: "productkennis",
  title: "Productkennis per categorie, seizoen en leverancier",
  modules: [
    { id: "jassen", title: "Jassen en buitenkleding voor het najaar" },
    { id: "accessoires", title: "Accessoires, sjaals, mutsen en handschoenen" }
  ]
}

export const BUSY_COURSES: ReadonlyArray<Course> = [
  "Maten en pasvorm van de Aurora Hooded Fleece en de rest van de fleececollectie",
  "Wasvoorschriften die klanten het vaakst vragen",
  "Welke leverancier levert welke kleur",
  "Seizoensaanbiedingen en wanneer ze stoppen",
  "Klachten over stiksels: foto's beoordelen",
  "Duitse klanten: veelgestelde vragen over verzending en douane",
  "Cadeaubonnen en tegoeden",
  "Sale-artikelen en de uitzonderingen op het retourbeleid",
  "Productfoto's die klanten verwarren"
].map((title, i) => ({
  ...base,
  id: `drukte-${i + 1}`,
  title,
  chapterId: BUSY_CHAPTER.id,
  moduleId: i < 5 ? "jassen" : "accessoires",
  description: "Wat de klant vraagt, en het antwoord dat we geven.",
  status: i === 3 ? "concept" : "live",
  audience: { kind: "all" },
  badge: "star",
  updated: `${21 - i} nov`,
  blocks: [
    text(
      `drukte-${i + 1}-1`,
      "Het antwoord",
      "Kijk eerst in de productpagina. Staat het er niet, vraag het dan in #operations; het antwoord komt binnen 1 werkdag in deze cursus."
    )
  ]
}))

/** Who a course is for, in words. */
export function audienceLabel(a: Audience, names: (p: PersonKey) => string): string {
  if (a.kind === "all") return "Iedereen"
  return [...a.roles, ...a.people.map(names)].join(", ") || "Nog niemand"
}

/** Whether a person with this role follows the course. */
export function follows(c: Course, person: PersonKey, role: string): boolean {
  if (c.status !== "live") return false
  if (c.audience.kind === "all") return true
  return c.audience.roles.includes(role) || c.audience.people.includes(person)
}

/** Reading time at 200 words a minute, plus the videos. */
export function minutesOf(c: Course): number {
  let words = 0
  let video = 0
  for (const b of c.blocks) {
    if (b.kind === "text") words += b.body.split(/\s+/).length
    if (b.kind === "quiz") words += 30
    if (b.kind === "video") video += b.minutes
  }
  return Math.max(1, Math.round(words / 200 + video))
}

/** The page's and the shell's counts, from one place. */
export function courseCounts(courses: ReadonlyArray<Course>, questions: ReadonlyArray<Question>) {
  return {
    live: courses.filter((c) => c.status === "live").length,
    drafts: courses.filter((c) => c.status === "concept").length,
    archived: courses.filter((c) => c.status === "archief").length,
    open: questions.filter((q) => q.answer === undefined).length
  }
}
