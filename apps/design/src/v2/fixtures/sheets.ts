import { PRODUCTS } from "./records.ts"
import type { PEOPLE } from "./workspace.ts"

/**
 * Sheets: Northwind's own calculations on Insyte's figures. Rebuilt from the current demo's
 * `mock-data/sheets.ts` and its templates (`@insyte/domain/sheet-templates`), on this version's week:
 * the profit sheet reads `INSYTE()` per day of 16–22 nov (the same figures as Kosten and Analyse,
 * `fixtures/costs.ts`), a purchasing sheet is typed in by hand (one price still missing, so one margin
 * cannot be worked out yet), Sofía shares her returns sheet, and last year's Black Friday plan sits in
 * the archive.
 */

export type Fmt = "money" | "integer" | "number" | "percent" | "text"
export type Cell = { readonly v: string; readonly fmt?: Fmt; readonly bold?: boolean }
export type Tab = {
  readonly id: string
  readonly name: string
  readonly cells: Readonly<Record<string, Cell>>
  /** Column widths in px by letter, where a column needs more than the default. */
  readonly widths: Readonly<Record<string, number>>
}

export type SheetRecord = {
  readonly kind: "page" | "product" | "supplier"
  readonly label: string
  readonly href: string
  readonly meta: string
}

export type Sheet = {
  readonly id: string
  readonly title: string
  readonly folderId: string | null
  readonly pinned: boolean
  readonly archived: boolean
  readonly owner: keyof typeof PEOPLE
  /** Who else may open it, as `PEOPLE` keys. */
  readonly shared: ReadonlyArray<keyof typeof PEOPLE>
  readonly updated: string
  /** Sortable: minutes since it was last opened. */
  readonly opened: number
  readonly tabs: ReadonlyArray<Tab>
  /** What it reads, for the werkdraad: Insyte's figures, the products it is about. */
  readonly reads: ReadonlyArray<SheetRecord>
}

export type Folder = { readonly id: string; readonly name: string }

/* ── building a tab ───────────────────────────────────────────────────────────────────────────── */

export const COLUMNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
export const addr = (col: number, row: number) => `${COLUMNS[col] ?? "A"}${row + 1}`

type Spec = ReadonlyArray<ReadonlyArray<string | readonly [string, Fmt?, boolean?] | null>>

export function tabFrom(id: string, name: string, rows: Spec, widths: Record<string, number> = {}): Tab {
  const cells: Record<string, Cell> = {}
  rows.forEach((row, r) =>
    row.forEach((x, c) => {
      if (x === null || x === "") return
      const [v, fmt, bold] = typeof x === "string" ? [x] : x
      cells[addr(c, r)] = {
        v,
        ...(fmt === undefined ? {} : { fmt }),
        ...(bold === true || r === 0 ? { bold: true } : {})
      }
    })
  )
  return { id, name, cells, widths }
}

const DAYS: ReadonlyArray<readonly [string, string]> = [
  ["ma 16 nov", "2026-11-16"],
  ["di 17 nov", "2026-11-17"],
  ["wo 18 nov", "2026-11-18"],
  ["do 19 nov", "2026-11-19"],
  ["vr 20 nov", "2026-11-20"],
  ["za 21 nov", "2026-11-21"],
  ["zo 22 nov", "2026-11-22"]
]

/** Winst per dag: revenue to net profit for each day of the week, every cell a formula. */
export function profitTab(id: string): Tab {
  const last = DAYS.length + 1
  return tabFrom(
    id,
    "Overzicht",
    [
      ["Dag", "Omzet", "Bestellingen", "Inkoop", "Advertenties", "Overige kosten", "Nettowinst", "Marge"],
      ...DAYS.map(([label, day], i) => {
        const r = i + 2
        return [
          label,
          [`=INSYTE("omzet"; "${day}")`, "money"],
          [`=INSYTE("bestellingen"; "${day}")`, "integer"],
          [`=INSYTE("inkoop"; "${day}")`, "money"],
          [`=INSYTE("advertentiekosten"; "${day}")`, "money"],
          [`=INSYTE("overige_kosten"; "${day}")`, "money"],
          [`=B${r}-D${r}-E${r}-F${r}`, "money"],
          [`=G${r}/B${r}`, "percent"]
        ] as const
      }),
      [
        ["Week", undefined, true],
        [`=SOM(B2:B${last})`, "money", true],
        [`=SOM(C2:C${last})`, "integer", true],
        [`=SOM(D2:D${last})`, "money", true],
        [`=SOM(E2:E${last})`, "money", true],
        [`=SOM(F2:F${last})`, "money", true],
        [`=SOM(G2:G${last})`, "money", true],
        [`=G${last + 1}/B${last + 1}`, "percent", true]
      ],
      [],
      ["Gemiddelde bestelling", [`=B${last + 1}/C${last + 1}`, "money"]],
      ["ROAS", [`=B${last + 1}/E${last + 1}`, "number"]]
    ],
    { A: 170, G: 120 }
  )
}

function adsTab(id: string): Tab {
  return tabFrom(
    id,
    "Kanalen",
    [
      ["Kanaal", "Uitgaven", "Deel", "Bron"],
      ["Meta Ads", [`=INSYTE("advertenties_meta"; "week")`, "money"], ["=B2/B4", "percent"], "Gekoppeld"],
      [
        "Google Ads",
        [`=INSYTE("advertenties_google"; "week")`, "money"],
        ["=B3/B4", "percent"],
        "Getypt van de factuur"
      ],
      [["Totaal", undefined, true], ["=SOM(B2:B3)", "money", true], ["=SOM(C2:C3)", "percent", true]],
      [],
      ["Omzet van de week", [`=INSYTE("omzet"; "week")`, "money"]],
      ["ROAS, alle kanalen", ["=B6/B4", "number"]],
      ["Advertenties per bestelling", [`=B4/INSYTE("bestellingen"; "week")`, "money"]]
    ],
    { A: 210, D: 190 }
  )
}

const cost = (id: string) => PRODUCTS.find((p) => p.id === id)?.cost ?? 0
const price = (id: string) => PRODUCTS.find((p) => p.id === id)?.price ?? 0
const nl = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const purchase = tabFrom(
  "tab-allure",
  "Allure",
  [
    ["Product", "Stuks", "Inkoopprijs", "Inkoop totaal", "Verkoopprijs", "Marge"],
    ["Aurora Hooded Fleece", "240", [nl(cost("aurora-hooded-fleece")), "money"], ["=B2*C2", "money"], [
      nl(price("aurora-hooded-fleece")),
      "money"
    ], ["=(E2-C2)/E2", "percent"]],
    ["Drift Crewneck", "120", [nl(cost("drift-crewneck")), "money"], ["=B3*C3", "money"], [
      nl(price("drift-crewneck")),
      "money"
    ], ["=(E3-C3)/E3", "percent"]],
    ["Heartland Henley", "160", [nl(cost("heartland-henley")), "money"], ["=B4*C4", "money"], [
      nl(price("heartland-henley")),
      "money"
    ], ["=(E4-C4)/E4", "percent"]],
    ["Cloud Joggers", "80", [nl(cost("cloud-joggers")), "money"], ["=B5*C5", "money"], null, [
      "=(E5-C5)/E5",
      "percent"
    ]],
    [["Totaal", undefined, true], ["=SOM(B2:B5)", "integer", true], null, ["=SOM(D2:D5)", "money", true]],
    [],
    ["Voorjaarsprijs Cloud Joggers nog niet vastgesteld met Allure."]
  ],
  { A: 190, D: 120, E: 110 }
)

const returnsTab = tabFrom(
  "tab-retour",
  "Retouren",
  [
    ["Product", "Terugbetaald", "Kosten per retour", "Totaal"],
    ["Aurora Hooded Fleece", "26", ["6,95", "money"], ["=B2*C2", "money"]],
    ["Drift Crewneck", "6", ["6,95", "money"], ["=B3*C3", "money"]],
    ["Field Pant · Olive", "5", ["6,95", "money"], ["=B4*C4", "money"]],
    ["Coastline Bomber Jacket", "4", ["8,95", "money"], ["=B5*C5", "money"]],
    [["Totaal", undefined, true], ["=SOM(B2:B5)", "integer", true], null, ["=SOM(D2:D5)", "money", true]],
    [],
    ["Aandeel Aurora", ["=B2/B6", "percent"]],
    ["Klopt met Insyte", [`=B6-INSYTE("terugbetalingen"; "week")`, "integer"]]
  ],
  { A: 200, C: 130 }
)

export const FOLDERS: ReadonlyArray<Folder> = [
  { id: "financien", name: "Financiën" },
  { id: "inkoop", name: "Inkoop" }
]

const figures = (meta: string): SheetRecord => ({ kind: "page", label: "Kosten", href: "/v2/kosten", meta })

export const SHEETS: ReadonlyArray<Sheet> = [
  {
    id: "winst-per-dag",
    title: "Winst per dag",
    folderId: "financien",
    pinned: true,
    archived: false,
    owner: "elena",
    shared: ["sofia"],
    updated: "vandaag 09:12",
    opened: 318,
    tabs: [profitTab("tab-winst")],
    reads: [
      { kind: "page", label: "Analyse", href: "/v2/analyse/week", meta: "omzet en bestellingen" },
      figures("inkoop en kosten")
    ]
  },
  {
    id: "advertenties",
    title: "Advertenties per kanaal",
    folderId: "financien",
    pinned: false,
    archived: false,
    owner: "elena",
    shared: [],
    updated: "20 nov",
    opened: 1_900,
    tabs: [adsTab("tab-ads")],
    reads: [figures("Meta en Google Ads")]
  },
  {
    id: "inkoop-allure",
    title: "Inkoop Allure, voorjaar",
    folderId: "inkoop",
    pinned: false,
    archived: false,
    owner: "elena",
    shared: [],
    updated: "17 nov",
    opened: 7_400,
    tabs: [purchase],
    reads: [
      {
        kind: "supplier",
        label: "Allure Fulfillment",
        href: "/v2/leveranciers/allure-fulfillment",
        meta: "vier producten"
      },
      { kind: "product", label: "Aurora Hooded Fleece", href: "/v2/producten/aurora-hooded-fleece", meta: "240 stuks" }
    ]
  },
  {
    id: "retourkosten",
    title: "Retourkosten per product",
    folderId: null,
    pinned: false,
    archived: false,
    owner: "sofia",
    shared: ["elena"],
    updated: "21 nov",
    opened: 2_900,
    tabs: [returnsTab],
    reads: [
      {
        kind: "product",
        label: "Aurora Hooded Fleece",
        href: "/v2/producten/aurora-hooded-fleece",
        meta: "26 terugbetaald"
      },
      { kind: "page", label: "Retouren", href: "/v2/retouren", meta: "41 deze week" }
    ]
  },
  {
    id: "black-friday-2025",
    title: "Black Friday 2025",
    folderId: null,
    pinned: false,
    archived: true,
    owner: "elena",
    shared: [],
    updated: "28 nov 2025",
    opened: 520_000,
    tabs: [tabFrom("tab-bf", "Plan", [["Actie", "Korting"], ["Fleece", ["30%", "text"]], ["Mutsen", "2 voor 1"]])],
    reads: []
  }
]

/** The busy week: a dozen more sheets with the long titles people give them. */
export const BUSY_SHEETS: ReadonlyArray<Sheet> = Array.from({ length: 12 }, (_, i) => ({
  id: `drukte-${i + 1}`,
  title: [
    "Marge per product per leverancier, met verzendkosten naar Duitsland en Oostenrijk",
    "Black Friday 2026: kortingen, voorraad en verwachte omzet per dag",
    "Retourkosten per maat voor de fleececollectie (S, M, L, XL)",
    "Kestrel Goods: levertijd per bestelling sinds september",
    "Advertenties per campagne, met de ROAS per week",
    "Inkoop DPC Apparel, najaar"
  ][i % 6] ?? "Blad",
  folderId: i % 3 === 0 ? "financien" : i % 3 === 1 ? "inkoop" : null,
  pinned: false,
  archived: false,
  owner: (["elena", "sofia", "ethan"] as const)[i % 3] ?? "elena",
  shared: [],
  updated: `${10 + i} nov`,
  opened: 10_000 + i * 900,
  tabs: [profitTab(`tab-drukte-${i}`)],
  reads: [figures("omzet en kosten")]
}))

/** The menu's and the page's counts, from one place. */
export function sheetCounts(sheets: ReadonlyArray<Sheet>, me: keyof typeof PEOPLE = "elena") {
  const live = sheets.filter((s) => !s.archived)
  return {
    all: live.length,
    pinned: live.filter((s) => s.pinned).length,
    shared: live.filter((s) => s.owner !== me && s.shared.includes(me)).length,
    archived: sheets.filter((s) => s.archived).length,
    folder: (id: string) => live.filter((s) => s.folderId === id).length
  }
}
