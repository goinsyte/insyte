/*
 * The brand book's table of contents, and the one place a chapter or a page is named.
 *
 * The bar, the menu, the in-page index, the page numbers ("Pagina 14") and the chapter footer all
 * read this list, so a page added here is numbered, indexed and linked everywhere at once, and a
 * page a chapter renders without an entry here fails the typecheck (`SectionPage` takes a page id
 * of its own chapter). Numbering runs continuously through the book: the cover is page 1, each
 * chapter's hero is a page, then its section pages.
 */

export type Ground = "abyss" | "arc" | "paper" | "mist"

type PageDef = { readonly id: string; readonly title: string }

type ChapterDef = {
  readonly id: string
  /** The plate number, "01". */
  readonly n: string
  readonly title: string
  /** The hero's second line, in the quieter ink. */
  readonly second: string
  /** One sentence under the title; also the menu's description. */
  readonly lede: string
  readonly ground: Ground
  /** Where the specimens come from, for the hero's title block. */
  readonly source: string
  readonly pages: ReadonlyArray<PageDef>
}

export const CHAPTERS = [
  {
    id: "merk",
    n: "01",
    title: "Merk",
    second: "Het werk, binnen jouw regels.",
    lede: "Voor wie Insyte is, wat de agent doet en hoe het praat. De rest van het boek volgt hieruit.",
    ground: "abyss",
    source: "PRODUCT.md · docs/dutch-copy.md",
    pages: [
      { id: "positie", title: "Positie" },
      { id: "mechanisme", title: "Het mechanisme" },
      { id: "blauwdruk", title: "De Blauwdruk" },
      { id: "principes", title: "Vijf principes" },
      { id: "beweren", title: "Wat we beweren" },
      { id: "stem", title: "Stem en toon" },
      { id: "nederlands", title: "Nederlands schrijven" },
      { id: "toepassing", title: "Toepassing" }
    ]
  },
  {
    id: "logo",
    n: "02",
    title: "Logo",
    second: "Eén teken, goed gezet.",
    lede:
      "Drift: drie verspringende vierkanten. Hetzelfde teken als in het product en op de site, in een paar vaste vormen.",
    ground: "arc",
    source: "brand/mark.tsx · brand/marks.tsx",
    pages: [
      { id: "beeldmerk", title: "Het beeldmerk" },
      { id: "lockup", title: "Beeldmerk en woordmerk" },
      { id: "tonen", title: "Tonen en gronden" },
      { id: "schalen", title: "Logo schalen" },
      { id: "app-icoon", title: "App-icoon en favicon" },
      { id: "constructie", title: "Constructie en vrije ruimte" },
      { id: "niet", title: "Niet doen" },
      { id: "bestanden", title: "Bestanden" }
    ]
  },
  {
    id: "kleur",
    n: "03",
    title: "Kleur",
    second: "Eén blauw, inkt zonder kleur.",
    lede: "Alles wat je bedient is Royal Azure. De rest is grijs zonder tint, en donker is altijd abyss.",
    ground: "paper",
    source: "@insyte/tokens · tokens.ts",
    pages: [
      { id: "palet", title: "Kleurenpalet" },
      { id: "oppervlakken", title: "Oppervlakken" },
      { id: "inkt", title: "Drie inkten" },
      { id: "abyss", title: "Op abyss" },
      { id: "paren", title: "Paren en contrast" },
      { id: "signalen", title: "Signalen" },
      { id: "regels", title: "Regels" },
      { id: "nacht", title: "Donker thema" }
    ]
  },
  {
    id: "typografie",
    n: "04",
    title: "Typografie",
    second: "Eén letter, en een cijfer.",
    lede: "General Sans voor alles wat je leest. Archivo, smal gezet, alleen voor cijfers en plaatnummers.",
    ground: "mist",
    source: "@insyte/tokens · text, fonts",
    pages: [
      { id: "lettertype", title: "Primair lettertype" },
      { id: "cijfers", title: "Cijfers" },
      { id: "schaal", title: "De schaal" },
      { id: "koppen", title: "Tweekleurige koppen" },
      { id: "regels", title: "Regels" }
    ]
  },
  {
    id: "patronen",
    n: "05",
    title: "Patronen & oppervlakken",
    second: "Getekend als een plaat.",
    lede:
      "Het tekenraster, de Drift-arcering, de plaat en de constructielijnen. De taal waarin elke pagina getekend is.",
    ground: "abyss",
    source: "app/app.css · marketing/frame.tsx · pages/shell.tsx",
    pages: [
      { id: "raster", title: "Tekenraster" },
      { id: "arcering", title: "Drift-arcering" },
      { id: "plaat", title: "De plaat" },
      { id: "constructie", title: "Constructielijnen" },
      { id: "helden", title: "Heldvormen" },
      { id: "gronden", title: "Gronden in volgorde" },
      { id: "hoeken", title: "Hoeken" },
      { id: "diepte", title: "Diepte" },
      { id: "dichtheid", title: "Dichtheid" }
    ]
  },
  {
    id: "iconen",
    n: "06",
    title: "Iconen & illustraties",
    second: "Getekend met de pen van de plaat.",
    lede:
      "Elk teken in Insyte is met dezelfde hand getekend: rechte lijnen, vierkante uiteinden en het verspringende vierkant van het merk.",
    ground: "arc",
    source: "icons.tsx · common/empty-icon.tsx · pages/variants",
    pages: [
      { id: "pen", title: "De pen" },
      { id: "huisiconen", title: "Huisiconen" },
      { id: "glyph", title: "Glyph in beweging" },
      { id: "leeg", title: "Tekens voor lege staten" },
      { id: "staptegels", title: "Staptegels" },
      { id: "merktekens", title: "Merktekens" },
      { id: "merkbeeld", title: "Merkbeeld" },
      { id: "keten", title: "De koppelingenketen" },
      { id: "achtergronden", title: "Achtergronden" },
      { id: "derden", title: "Merken van derden" }
    ]
  },
  {
    id: "beweging",
    n: "07",
    title: "Beweging",
    second: "Van de ene stand naar de andere.",
    lede:
      "Drie curves en vier duren uit de tokens. Beweging laat zien wat er veranderde, en staat stil als je dat vraagt.",
    ground: "paper",
    source: "@insyte/tokens · easings, durations",
    pages: [
      { id: "curves", title: "Curves" },
      { id: "duren", title: "Duren" },
      { id: "plaat", title: "De plaat tekent" },
      { id: "momenten", title: "Vaste momenten" },
      { id: "overgang", title: "Paginaovergang" },
      { id: "regels", title: "Regels" }
    ]
  }
] as const satisfies ReadonlyArray<ChapterDef>

export type Chapter = (typeof CHAPTERS)[number]
export type ChapterId = Chapter["id"]
export type PageId<C extends ChapterId> = Extract<Chapter, { id: C }>["pages"][number]["id"]

export const isChapter = (id: string): id is ChapterId => CHAPTERS.some((c) => c.id === id)

export const chapterOf = (id: ChapterId): Chapter => CHAPTERS.find((c) => c.id === id) ?? CHAPTERS[0]

const numbers = new Map<string, number>()
let next = 2 // the cover is page 1
for (const c of CHAPTERS) {
  numbers.set(c.id, next++)
  for (const p of c.pages) numbers.set(`${c.id}/${p.id}`, next++)
}

/** The book's last page number. */
export const PAGES = next - 1

/** A chapter hero's page number. */
export const heroPage = (id: ChapterId): number => numbers.get(id) ?? 0

/** A section page's number, counted through the whole book. */
export const pageNumber = <C extends ChapterId>(chapter: C, page: PageId<C>): number =>
  numbers.get(`${chapter}/${page}`) ?? 0

export const pageTitle = <C extends ChapterId>(chapter: C, page: PageId<C>): string =>
  chapterOf(chapter).pages.find((p) => p.id === page)?.title ?? page

/** "07", for a page number set as a plate number. */
export const two = (n: number): string => String(n).padStart(2, "0")

export const neighbours = (id: ChapterId): { prev: Chapter | undefined; next: Chapter | undefined } => {
  const i = CHAPTERS.findIndex((c) => c.id === id)
  return { prev: CHAPTERS[i - 1], next: CHAPTERS[i + 1] }
}

/** The day the book was last drawn, for every title block. */
export const UPDATED = "1 november 2026"
