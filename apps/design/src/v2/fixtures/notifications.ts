import { useSyncExternalStore } from "react"

/**
 * The notifications in the demo: what happened that is about Elena, newest first. Fictional, like
 * the rest of the workspace; the people and records are the ones the other fixtures use. The bell
 * shows the ones in the inbox (`shell/bar-actions.tsx`), the full page all of them
 * (`screens/notifications`).
 *
 * What happened to a note (read, set aside till later, cleared, its act done) is one fact for both,
 * kept here as marks over the seed. The bell's "Alles gelezen" is the demo store's `notesRead`
 * (`demo.ts`), which every reader ORs in; `unread` is a getter over the seed and the marks (unread
 * and in the inbox), so `unreadNotes()`, the bell's dot and the page can never disagree.
 */

/** What a notification is about: the page's filters. */
export type NoteKind = "vermelding" | "toewijzing" | "agent" | "systeem"

export type NoteFixture = {
  readonly id: string
  readonly kind: NoteKind
  readonly from: { readonly kind: "person"; readonly name: string } | {
    readonly kind: "agent"
    readonly agentId: string
  } | {
    readonly kind: "system"
    /** The connected service it came from (Klarna, Shopify), shown by its logo instead of the bell. */
    readonly service?: string
  }
  readonly text: string
  /** The time as people say it: "13:47", "gisteren", "20 nov". */
  readonly at: string
  /** Which day group it falls in on the page. */
  readonly day: "vandaag" | "gisteren" | "eerder"
  /** What someone wrote, quoted in full on the page. */
  readonly quote?: string
  /** The record it is about, as the page names it: "Ticket #5142". */
  readonly record?: string
  readonly href?: string
  /** What the record says, read in the preview beside the list. */
  readonly facts?: ReadonlyArray<readonly [string, string]>
  /** The one thing to do about it, done from the preview; "Openen" is always the way out. */
  readonly act?: NoteAct
  /** Where an answer to a mention lands: "ticket #5142". */
  readonly reply?: string
  /** The preview's way to the record: "Ticket openen". */
  readonly open?: string
  /** Unread and in the inbox: the seed under the marks (the bell's "Alles gelezen" is `notesRead`). */
  readonly unread: boolean
}

export type NoteAct = {
  readonly label: string
  /** What it says once done: "Goedgekeurd". */
  readonly done: string
  /** It takes a moment (a reconnect, a submission): the button spins first. */
  readonly slow?: boolean
  /** The proposal it decides on Start and Goedkeuringen (`fixtures/home.ts`). */
  readonly proposal?: string
}

type Seed = Omit<NoteFixture, "unread"> & { readonly unread: boolean }

const SEEDS: ReadonlyArray<Seed> = [
  {
    id: "n1",
    kind: "agent",
    from: { kind: "agent", agentId: "retouragent" },
    text: "Retouragent wil een omruiling aanbieden aan **Astrid Berg** en vraagt eerst.",
    at: "13:47",
    day: "vandaag",
    record: "Voorstel · omruiling naar maat M",
    href: "/v2/magnus/goedkeuringen",
    facts: [
      ["Voorstel", "Omruiling naar maat M"],
      ["Klant", "Astrid Berg"],
      ["Retour", "#R-881 · Aurora Hooded Fleece in S"],
      ["Voorraad M", "34 stuks"],
      ["Termijn", "vandaag 18:00"]
    ],
    act: { label: "Goedkeuren", done: "Goedgekeurd", proposal: "omruil-5321" },
    open: "Voorstel openen",
    unread: true
  },
  {
    id: "n2",
    kind: "vermelding",
    from: { kind: "person", name: "Sofía Kim" },
    text: "Sofía Kim noemde je in ticket **#5142**: ‘Kun jij de terugbetaling goedkeuren?’",
    at: "13:12",
    day: "vandaag",
    quote: "Kun jij de terugbetaling goedkeuren? Ik zit er nu in en wil de klant vandaag nog antwoord geven.",
    record: "Ticket #5142",
    href: "/v2/inbox/5142",
    facts: [
      ["Ticket", "#5142 · Geld terug voor een sale-artikel"],
      ["Klant", "Liam O’Connor · 7 bestellingen"],
      ["Bestelling", "#5297 · Heartland Henley"],
      ["Bedrag", "€ 45,40"]
    ],
    act: { label: "Terugbetaling goedkeuren", done: "Goedgekeurd" },
    reply: "ticket #5142",
    open: "Ticket openen",
    unread: true
  },
  {
    id: "n3",
    kind: "systeem",
    from: { kind: "system", service: "klarna" },
    text: "Chargeback **#CB-2291** moet uiterlijk morgen 12:00 beantwoord zijn.",
    at: "11:05",
    day: "vandaag",
    record: "Chargeback #CB-2291 · Klarna · € 129,00",
    href: "/v2/chargebacks/cb-2291",
    facts: [
      ["Zaak", "#CB-2291 · Klarna"],
      ["Bedrag", "€ 129,00"],
      ["Bestelling", "#5318"],
      ["Bewijs", "Pakket staat klaar: track & trace, bezorgfoto, mails"],
      ["Termijn", "morgen 12:00"]
    ],
    act: { label: "Bewijs indienen", done: "Ingediend bij Klarna", slow: true },
    open: "Chargeback openen",
    unread: true
  },
  {
    id: "n6",
    kind: "systeem",
    from: { kind: "system", service: "shopify" },
    text: "**Northwind UK** is ontkoppeld van Shopify; nieuwe bestellingen komen niet binnen.",
    at: "09:12",
    day: "vandaag",
    record: "Winkel · Northwind UK",
    href: "/v2/instellingen/winkels",
    facts: [
      ["Winkel", "Northwind UK · northwind-uk.myshopify.com"],
      ["Status", "Ontkoppeld"],
      ["Laatst gesynchroniseerd", "vandaag 09:10"]
    ],
    act: { label: "Opnieuw koppelen", done: "Weer gekoppeld", slow: true },
    open: "Winkels openen",
    unread: false
  },
  {
    id: "n7",
    kind: "agent",
    from: { kind: "agent", agentId: "weekrapport" },
    text: "Weekrapport zette de week van 16–22 nov op het bord **Weekoverzicht**.",
    at: "08:00",
    day: "vandaag",
    record: "Bord · Weekoverzicht",
    href: "/v2/analyse/week",
    facts: [["Bord", "Weekoverzicht"], ["Week", "16–22 nov"], ["Volgende keer", "maandag 30 nov 08:00"]],
    open: "Bord openen",
    unread: false
  },
  {
    id: "n4",
    kind: "toewijzing",
    from: { kind: "person", name: "Ethan Jeppesen" },
    text: "Ethan Jeppesen wees **6 bestellingen** van Kestrel Goods aan je toe.",
    at: "gisteren",
    day: "gisteren",
    record: "Leverancier · Kestrel Goods",
    href: "/v2/leveranciers/kestrel-goods",
    facts: [
      ["Leverancier", "Kestrel Goods"],
      ["Bestellingen", "6 vertraagd · oudste 8 dagen onderweg"],
      ["Laatste mail", "gisteren 10:15 · geen antwoord"]
    ],
    act: { label: "Tweede mail versturen", done: "Verstuurd", proposal: "mail-kestrel" },
    open: "Leverancier openen",
    unread: false
  },
  {
    id: "n5",
    kind: "agent",
    from: { kind: "agent", agentId: "waar-is-mijn-bestelling" },
    text: "Waar is mijn bestelling beantwoordde **38 tickets** zelf; 2 droeg hij over.",
    at: "gisteren",
    day: "gisteren",
    record: "Agent · Waar is mijn bestelling",
    href: "/v2/magnus/agents/waar-is-mijn-bestelling",
    facts: [["Zelf beantwoord", "38 tickets"], ["Overgedragen", "2"], ["Gemiddelde reactie", "1 min 12 s"]],
    open: "Agent openen",
    unread: false
  },
  {
    id: "n8",
    kind: "toewijzing",
    from: { kind: "person", name: "Sofía Kim" },
    text: "Sofía Kim wees ticket **#5148** van Astrid Berg aan je toe.",
    at: "gisteren",
    day: "gisteren",
    record: "Ticket #5148",
    href: "/v2/inbox/5148",
    facts: [
      ["Ticket", "#5148 · Ruilen voor een M"],
      ["Klant", "Astrid Berg"],
      ["Bestelling", "#5296 · Aurora Hooded Fleece"]
    ],
    reply: "ticket #5148",
    open: "Ticket openen",
    unread: false
  },
  {
    id: "n9",
    kind: "systeem",
    from: { kind: "system" },
    text: "Het AI-tegoed van de werkruimte staat op **62%** van de maandlimiet.",
    at: "21 nov",
    day: "eerder",
    record: "Instellingen · Limieten",
    href: "/v2/instellingen/ai/limieten",
    facts: [["Verbruik", "62% van de maandlimiet"], ["Vernieuwt", "1 dec"]],
    open: "Limieten openen",
    unread: false
  },
  {
    id: "n10",
    kind: "vermelding",
    from: { kind: "person", name: "Sofía Kim" },
    text: "Sofía Kim noemde je bij de **Aurora Hooded Fleece**: ‘De maattabel is aangepast.’",
    at: "20 nov",
    day: "eerder",
    quote: "De maattabel is aangepast: de S valt kleiner uit dan Allure opgaf. Kijk jij of de productpagina nu klopt?",
    record: "Product · Aurora Hooded Fleece",
    href: "/v2/producten/aurora-hooded-fleece",
    facts: [["Product", "Aurora Hooded Fleece"], ["Leverancier", "Allure Apparel"]],
    reply: "de notities van de Aurora Hooded Fleece",
    open: "Product openen",
    unread: false
  }
]

/* ── what happened to a note: the marks over the seed ─────────────────────────────────────────── */

/** Where a note is: in the inbox, set aside till later, or cleared (still on the page, under Gewist). */
export type NoteBox = "inbox" | "later" | "gewist"

export type NoteMark = {
  readonly read?: boolean
  readonly box?: NoteBox
  /** When a note set aside comes back, as people say it: "morgen 09:00". */
  readonly until?: string
  /** Its act is done. */
  readonly done?: boolean
}

let marks: Readonly<Record<string, NoteMark>> = {}
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The marks; a component re-renders when they change. */
export const useNoteMarks = () => useSyncExternalStore(subscribe, () => marks)

/** Change several notes at once. The answer puts them back as they were: the Undo. */
export function markNotes(ids: ReadonlyArray<string>, patch: NoteMark): () => void {
  const before = Object.fromEntries(ids.map((id) => [id, marks[id]]))
  marks = { ...marks, ...Object.fromEntries(ids.map((id) => [id, { ...marks[id], ...patch }])) }
  emit()
  return () => {
    const back = { ...marks }
    for (const [id, mark] of Object.entries(before)) {
      if (mark === undefined) delete back[id]
      else back[id] = mark
    }
    marks = back
    emit()
  }
}

const SEED_UNREAD = new Set(SEEDS.filter((s) => s.unread).map((s) => s.id))

/** Read as far as this note goes (the bell's "Alles gelezen" is ORed in by the reader). */
export const isRead = (id: string) => marks[id]?.read ?? !SEED_UNREAD.has(id)
export const boxOf = (id: string): NoteBox => marks[id]?.box ?? "inbox"

export const NOTIFICATIONS: ReadonlyArray<NoteFixture> = SEEDS.map((seed) =>
  Object.defineProperty({ ...seed }, "unread", {
    enumerable: true,
    get: () => boxOf(seed.id) === "inbox" && !isRead(seed.id)
  }) as NoteFixture
)

/** What the bell shows: the inbox only; set aside and cleared notes live on the page. */
export const bellNotes = () => NOTIFICATIONS.filter((n) => boxOf(n.id) === "inbox")

/** The bell's tabs: what is addressed to you (a mention, an assignment) and what an agent asked. */
export const noteAbout = (n: NoteFixture) =>
  n.kind === "agent" ? "agent" as const : n.kind === "systeem" ? undefined : "me" as const

/** "Later": when a set-aside note comes back. Today is Monday 23 November, 13:50. */
export const SNOOZE = [
  { id: "middag", label: "Vanmiddag", hint: "15:00", until: "vandaag 15:00" },
  { id: "morgen", label: "Morgen", hint: "di 09:00", until: "morgen 09:00" },
  { id: "week", label: "Volgende week", hint: "ma 30 nov 09:00", until: "ma 30 nov 09:00" }
] as const

/**
 * The busy week (`?staat=druk`): the same kinds of notes, many more of them and with long names, all
 * read and all older, so the page's day groups and filters carry a long list. Not in the bell.
 */
const BUSY_PEOPLE = ["Sofía Kim", "Ethan Jeppesen", "Maximiliaan van der Westhuizen-Vermeulen", "Maya Roy"] as const
const BUSY_TICKETS = [5102, 5107, 5111, 5115, 5118, 5120, 5123, 5126, 5129, 5131, 5133, 5136] as const

export const BUSY_NOTES: ReadonlyArray<NoteFixture> = BUSY_TICKETS.flatMap((ticket, i): ReadonlyArray<NoteFixture> => {
  const who = BUSY_PEOPLE[i % BUSY_PEOPLE.length] ?? "Sofía Kim"
  const at = `${19 - Math.floor(i / 4)} nov`
  return [
    {
      id: `busy-${ticket}-a`,
      kind: i % 2 === 0 ? "vermelding" : "toewijzing",
      from: { kind: "person", name: who },
      text: i % 2 === 0
        ? `${who} noemde je in ticket **#${ticket}**: ‘Kun jij hier even naar kijken voordat de klant terugbelt?’`
        : `${who} wees ticket **#${ticket}** aan je toe.`,
      at,
      day: "eerder",
      record: `Ticket #${ticket}`,
      href: `/v2/inbox/${ticket}`,
      unread: false
    },
    {
      id: `busy-${ticket}-b`,
      kind: "agent",
      from: { kind: "agent", agentId: "waar-is-mijn-bestelling" },
      text: `Waar is mijn bestelling beantwoordde ticket **#${ticket + 1}** zelf en sloot het.`,
      at,
      day: "eerder",
      record: `Ticket #${ticket + 1}`,
      href: `/v2/inbox/${ticket + 1}`,
      unread: false
    }
  ]
})
