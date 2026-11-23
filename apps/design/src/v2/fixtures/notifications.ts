/**
 * The notifications in the demo: what happened that is about Elena, newest first. Fictional, like
 * the rest of the workspace; the people and records are the ones the other fixtures use. The bell
 * shows them (`shell/bar-actions.tsx`), and so does the full page (`screens/notifications`).
 *
 * Read or unread is one fact for both. The bell's "Alles gelezen" is the demo store's `notesRead`
 * (`demo.ts`), which every reader ANDs in; a single note read or unread on the page is an override
 * kept here, and `unread` is a getter over the seed and that override, so `unreadNotes()`, the bell's
 * dot and the page's filter can never disagree. When per-note read state moves into `demo.ts`, the
 * getter goes and `unread` becomes the seed again.
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
  /** Unread as far as this note goes: its seed or the page's override (the bell's "Alles gelezen" is `notesRead`). */
  readonly unread: boolean
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
    unread: true
  },
  {
    id: "n3",
    kind: "systeem",
    from: { kind: "system" },
    text: "Chargeback **#CB-2291** moet uiterlijk morgen 12:00 beantwoord zijn.",
    at: "11:05",
    day: "vandaag",
    record: "Chargeback #CB-2291 · Klarna · € 129,00",
    href: "/v2/chargebacks/cb-2291",
    unread: true
  },
  {
    id: "n6",
    kind: "systeem",
    from: { kind: "system" },
    text: "**Northwind UK** is ontkoppeld van Shopify; nieuwe bestellingen komen niet binnen.",
    at: "09:12",
    day: "vandaag",
    record: "Winkel · Northwind UK",
    href: "/v2/instellingen/winkels",
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
    unread: false
  }
]

/* ── read state: the page's overrides, under the bell's "Alles gelezen" ──────────────────────────── */

let overrides: Readonly<Record<string, boolean>> = {}

/** Set one note read (true) or unread (false) on the page; `null` drops the override. */
export function setNoteOverride(id: string, read: boolean | null) {
  const rest = Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== id))
  overrides = read === null ? rest : { ...rest, [id]: read }
}

/** All overrides at once: after the bell's "Alles gelezen" is taken back for one note. */
export function setNoteOverrides(next: Readonly<Record<string, boolean>>) {
  overrides = next
}

export const NOTIFICATIONS: ReadonlyArray<NoteFixture> = SEEDS.map((seed) =>
  Object.defineProperty({ ...seed }, "unread", {
    enumerable: true,
    get: () => (overrides[seed.id] === undefined ? seed.unread : !overrides[seed.id])
  }) as NoteFixture
)

/** Whether a note started out unread, before anyone read it: the seed. */
export const seededUnread = (id: string) => SEEDS.find((s) => s.id === id)?.unread ?? false

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
