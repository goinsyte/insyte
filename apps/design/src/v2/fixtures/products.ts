import { useSyncExternalStore } from "react"
import type { Tone } from "../ui/badge.tsx"
import type { View } from "../view.ts"
import { BLOCKS } from "./analytics.ts"
import { product, productOrders, PRODUCTS, supplier } from "./records.ts"
import type { Order, Product, ProductStatus } from "./records.ts"
import { PEOPLE } from "./workspace.ts"

/**
 * Producten: the catalogue of `records.ts` as the products area reads it. Stock per size, what sold
 * and came back last week (Analyse's own figures where it has them, so the Aurora reads 212 sold and
 * 26 refunds everywhere), margin, who last changed a product, and the quality checks and complaints
 * of `mock-data/quality.ts` moved onto this catalogue. What the operator changes in the demo (a
 * status, a price, ads paused, a check requested) lives in the store at the foot.
 */

export const STATUS: Readonly<Record<ProductStatus, { readonly label: string; readonly tone: Tone }>> = {
  actief: { label: "Actief", tone: "good" },
  concept: { label: "Concept", tone: "neutral" },
  gearchiveerd: { label: "Gearchiveerd", tone: "neutral" }
}

export type StockLevel = "op-voorraad" | "laag" | "op"

export const STOCK: Readonly<Record<StockLevel, { readonly label: string; readonly tone: Tone }>> = {
  "op-voorraad": { label: "Op voorraad", tone: "good" },
  laag: { label: "Lage voorraad", tone: "warn" },
  op: { label: "Uitverkocht", tone: "bad" }
}

/* ── the demo's own changes ────────────────────────────────────────────────────────────────────── */

export type ProductEdit = {
  readonly status?: ProductStatus
  readonly price?: number
  readonly cost?: number
  readonly adsPaused?: boolean
  readonly watch?: boolean
}

export type ProductState = {
  readonly edits: Readonly<Record<string, ProductEdit>>
  /** Checks requested in the demo, on top of the ones below. */
  readonly checks: ReadonlyArray<QualityCheck>
  /** The low-stock proposal: open, done or discarded. */
  readonly advice: "open" | "done" | "discarded"
}

let state: ProductState = { edits: {}, checks: [], advice: "open" }
const listeners = new Set<() => void>()

export function setProductState(next: (s: ProductState) => ProductState) {
  state = next(state)
  for (const l of listeners) l()
}

export function editProduct(id: string, patch: ProductEdit) {
  setProductState((s) => ({ ...s, edits: { ...s.edits, [id]: { ...s.edits[id], ...patch } } }))
}

export function useProductState(): ProductState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}

export const getProductState = () => state

/* ── sales and returns ─────────────────────────────────────────────────────────────────────────── */

const WEEK_START = new Date(2026, 10, 16).getTime()
const TODAY_START = new Date(2026, 10, 23).getTime()
const inWeek = (o: Order) => o.placedAt.getTime() >= WEEK_START && o.placedAt.getTime() < TODAY_START

/** Analyse's "Welke producten komen terug?" (16–22 nov), the figures the story quotes. */
const ANALYSE_ROWS = BLOCKS.retourPerProduct.data.rows as ReadonlyArray<
  { readonly product: string; readonly sold: number; readonly returned: number }
>

/** Sold and refunded in the week of 16 to 22 November. */
export function weekOf(p: Product): { readonly sold: number; readonly returned: number } {
  const row = ANALYSE_ROWS.find((r) => r.product === p.name)
  if (row !== undefined) return { sold: row.sold, returned: row.returned }
  const week = productOrders(p.id).filter(inWeek)
  const sold = week.flatMap((o) => o.lines).filter((l) => l.productId === p.id).reduce((n, l) => n + l.quantity, 0)
  return { sold, returned: week.filter((o) => o.status === "terugbetaald").length }
}

export const returnRate = (p: Product) => {
  const w = weekOf(p)
  return w.sold === 0 ? 0 : w.returned / w.sold
}

/** Why the Aurora came back last week (21 of the 23 ‘valt te klein’ in Analyse are hers). */
export const RETURN_REASONS: Readonly<
  Record<string, ReadonlyArray<{ readonly label: string; readonly value: number }>>
> = {
  "aurora-hooded-fleece": [
    { label: "Valt te klein", value: 21 },
    { label: "Niet zoals op de foto", value: 2 },
    { label: "Anders", value: 2 },
    { label: "Valt te groot", value: 1 }
  ]
}

/* ── stock per size ────────────────────────────────────────────────────────────────────────────── */

export type Variant = {
  readonly size: string
  readonly sku: string
  readonly stock: number
  readonly sold: number
  readonly returned: number
}

/** The Aurora by size: the S is where the returns are. */
const AURORA: ReadonlyArray<Omit<Variant, "sku">> = [
  { size: "S", stock: 38, sold: 61, returned: 21 },
  { size: "M", stock: 141, sold: 72, returned: 2 },
  { size: "L", stock: 152, sold: 52, returned: 2 },
  { size: "XL", stock: 81, sold: 27, returned: 1 }
]

/** Stock over the sizes, the middle sizes heaviest, summing to the product's stock to the unit. */
export function variantsOf(p: Product): ReadonlyArray<Variant> {
  if (p.id === "aurora-hooded-fleece") return AURORA.map((v) => ({ ...v, sku: `${p.sku}-${v.size}` }))
  const w = weekOf(p)
  const weights = p.sizes.map((_, i) => (p.sizes.length === 1 ? 1 : i === 0 || i === p.sizes.length - 1 ? 2 : 3))
  const total = weights.reduce((a, b) => a + b, 0)
  let stockLeft = p.stock
  let soldLeft = w.sold
  let returnedLeft = w.returned
  return p.sizes.map((size, i) => {
    const last = i === p.sizes.length - 1
    const share = (weights[i] ?? 1) / total
    const stock = last ? stockLeft : Math.round(p.stock * share)
    const sold = last ? soldLeft : Math.round(w.sold * share)
    const returned = last ? returnedLeft : Math.round(w.returned * share)
    stockLeft -= stock
    soldLeft -= sold
    returnedLeft -= returned
    return { size, sku: p.sizes.length === 1 ? p.sku : `${p.sku}-${size}`, stock, sold, returned }
  })
}

/** Days of stock at last week's pace, or null when nothing sold. */
export function daysLeft(p: Product): number | null {
  const perDay = weekOf(p).sold / 7
  return perDay === 0 ? null : p.stock / perDay
}

export function stockOf(p: Product): StockLevel {
  if (p.stock === 0) return "op"
  const days = daysLeft(p)
  return p.stock < 40 || (days !== null && days < 10) ? "laag" : "op-voorraad"
}

/* ── who changed it ────────────────────────────────────────────────────────────────────────────── */

export type Change = { readonly who: keyof typeof PEOPLE; readonly what: string; readonly at: string }

const CHANGES: Readonly<Record<string, ReadonlyArray<Change>>> = {
  "aurora-hooded-fleece": [
    { who: "sofia", what: "wijzigde de maattabel: de S valt nu ‘klein’", at: "20 nov" },
    { who: "elena", what: "vroeg een batchcontrole aan bij Allure Fulfillment", at: "gisteren 11:05" },
    { who: "elena", what: "zette de prijs op € 79", at: "2 nov" }
  ],
  "coastline-bomber-jacket": [
    { who: "elena", what: "zette de Coastline-actie aan: € 20 korting", at: "12 nov" }
  ],
  "sequoia-flannel": [{ who: "ethan", what: "vroeg DPC Apparel om een levertijd", at: "18 nov" }],
  "harbor-raincoat": [{ who: "sofia", what: "zette het product onder toezicht", at: "11 nov" }],
  "switchback-cap": [{ who: "maya", what: "maakte het product aan als concept", at: "19 nov" }],
  "pacific-sandal": [{ who: "liam", what: "archiveerde het product na het seizoen", at: "1 okt" }],
  "field-pant-stone": [{ who: "ethan", what: "vroeg een bijbestelling aan bij DPC Apparel", at: "17 nov" }]
}

const ROTATE: ReadonlyArray<keyof typeof PEOPLE> = ["liam", "ethan", "maya", "sofia"]

export function changesOf(p: Product): ReadonlyArray<Change> {
  return CHANGES[p.id] ?? [{
    who: ROTATE[p.name.length % ROTATE.length] ?? "liam",
    what: "werkte de producttekst bij",
    at: `${(p.name.length % 9) + 3} nov`
  }]
}

/* ── quality ───────────────────────────────────────────────────────────────────────────────────── */

export type CheckStatus = "aangevraagd" | "ingestuurd" | "goedgekeurd" | "afgekeurd"

export const CHECK_STATUS: Readonly<Record<CheckStatus, { readonly label: string; readonly tone: Tone }>> = {
  aangevraagd: { label: "Aangevraagd", tone: "neutral" },
  ingestuurd: { label: "Ingestuurd", tone: "accent" },
  goedgekeurd: { label: "Goedgekeurd", tone: "good" },
  afgekeurd: { label: "Afgekeurd", tone: "bad" }
}

export type CheckKind = "monster" | "batch" | "testbestelling"

export const CHECK_KIND: Readonly<Record<CheckKind, string>> = {
  monster: "Monster",
  batch: "Batchfoto's",
  testbestelling: "Testbestelling"
}

export type QualityCheck = {
  /** Also the public check page: `/v2/kwaliteit/qc-301`. */
  readonly id: string
  readonly productId: string
  readonly kind: CheckKind
  readonly sizes: ReadonlyArray<string>
  readonly status: CheckStatus
  readonly requestedBy: string
  readonly requestedAt: string
  readonly due: string
  readonly late?: boolean
  readonly note: string
  readonly verdict?: string
}

/** The checks of `mock-data/quality.ts`, on this catalogue: the Harbor under watch, the Aurora's open check. */
export const CHECKS: ReadonlyArray<QualityCheck> = [
  {
    id: "qc-301",
    productId: "aurora-hooded-fleece",
    kind: "batch",
    sizes: ["S", "M", "L"],
    status: "aangevraagd",
    requestedBy: PEOPLE.elena.name,
    requestedAt: "gisteren",
    due: "vr 27 nov",
    note:
      "De laatste batch viel klein in S. Meet de borstwijdte en de lengte van S, M en L, en fotografeer het label met het batchnummer."
  },
  {
    id: "qc-302",
    productId: "harbor-raincoat",
    kind: "batch",
    sizes: [],
    status: "afgekeurd",
    requestedBy: PEOPLE.elena.name,
    requestedAt: "16 nov",
    due: "18 nov",
    note: "Foto's van de nieuwe batch en het batchnummer.",
    verdict: "De naad bij de schouder is niet getapet, dus de jas is daar niet waterdicht. Stuur een nieuwe batch."
  },
  {
    id: "qc-303",
    productId: "harbor-raincoat",
    kind: "batch",
    sizes: [],
    status: "goedgekeurd",
    requestedBy: PEOPLE.elena.name,
    requestedAt: "18 nov",
    due: "22 nov",
    note: "Herstelde batch: dezelfde foto's, plus een video van de naden.",
    verdict: "Naden nu getapet, zie video."
  },
  {
    id: "qc-304",
    productId: "harbor-raincoat",
    kind: "monster",
    sizes: ["S", "M", "L", "XL"],
    status: "goedgekeurd",
    requestedBy: PEOPLE.sofia.name,
    requestedAt: "8 okt",
    due: "14 okt",
    note: "Monster van de eerste productie, met de maten van S tot XL."
  },
  {
    id: "qc-305",
    productId: "meridian-daypack",
    kind: "testbestelling",
    sizes: [],
    status: "aangevraagd",
    requestedBy: PEOPLE.ethan.name,
    requestedAt: "13 nov",
    due: "20 nov",
    late: true,
    note: "Verstuur de testbestelling zoals een klant hem krijgt, en film het uitpakken."
  }
]

export type Complaint = {
  readonly id: string
  readonly productId: string
  readonly size: string
  readonly at: string
  readonly text: string
  readonly from: "retour" | "bericht"
  readonly customerId: string
  readonly customer: string
}

export const COMPLAINTS: ReadonlyArray<Complaint> = [
  {
    id: "k-1",
    productId: "harbor-raincoat",
    size: "M",
    at: "08:30",
    text: "De naad bij de linkerschouder is gescheurd na twee keer dragen.",
    from: "retour",
    customerId: "felix-muller",
    customer: "Felix Muller"
  },
  {
    id: "k-2",
    productId: "harbor-raincoat",
    size: "M",
    at: "12 nov",
    text: "Rits trekt los van de stof na een week.",
    from: "retour",
    customerId: "chris-lee",
    customer: "Chris Lee"
  },
  {
    id: "k-3",
    productId: "harbor-raincoat",
    size: "L",
    at: "21 okt",
    text: "Lekt bij de schouders bij harde regen.",
    from: "bericht",
    customerId: "astrid-berg",
    customer: "Astrid Berg"
  },
  {
    id: "k-4",
    productId: "harbor-raincoat",
    size: "L",
    at: "14 okt",
    text: "Naad bij de schouder laat los.",
    from: "bericht",
    customerId: "soren-nilsson",
    customer: "Soren Nilsson"
  }
]

export type Phase = "actief" | "toezicht" | "test" | "uitgefaseerd"

export const PHASE: Readonly<Record<Phase, { readonly label: string; readonly tone: Tone }>> = {
  actief: { label: "Actief", tone: "neutral" },
  toezicht: { label: "Onder toezicht", tone: "warn" },
  test: { label: "Test", tone: "accent" },
  uitgefaseerd: { label: "Uitgefaseerd", tone: "neutral" }
}

const PHASES: Readonly<Record<string, Phase>> = {
  "harbor-raincoat": "toezicht",
  "meridian-daypack": "test",
  "pacific-sandal": "uitgefaseerd"
}

/** Sold in the last 90 days, for the complaint rate. */
const SOLD_90: Readonly<Record<string, number>> = {
  "harbor-raincoat": 65,
  "aurora-hooded-fleece": 2412,
  "meridian-daypack": 38
}

/** Above this share of complaints a product is flagged (5%). */
export const COMPLAINT_THRESHOLD = 0.05

export function qualityOf(p: Product, s: ProductState = state) {
  const checks = [...s.checks.filter((c) => c.productId === p.id), ...CHECKS.filter((c) => c.productId === p.id)]
  const complaints = COMPLAINTS.filter((c) => c.productId === p.id)
  const sold90 = SOLD_90[p.id] ?? weekOf(p).sold * 12
  const watched = s.edits[p.id]?.watch
  const phase: Phase = watched === true ? "toezicht" : watched === false ? "actief" : PHASES[p.id] ?? "actief"
  const rate = sold90 === 0 ? 0 : complaints.length / sold90
  return { checks, complaints, sold90, rate, over: rate > COMPLAINT_THRESHOLD, phase }
}

/* ── rows ──────────────────────────────────────────────────────────────────────────────────────── */

export type ProductRow = Product & {
  readonly supplierName: string
  readonly level: StockLevel
  readonly margin: number
  readonly sold: number
  readonly returned: number
  readonly rate: number
  readonly adsPaused: boolean
}

export const marginOf = (price: number, cost: number) => (price <= 0 ? 0 : (price - cost) / price)

function rowOf(p: Product, s: ProductState): ProductRow {
  const e = s.edits[p.id] ?? {}
  const next: Product = { ...p, status: e.status ?? p.status, price: e.price ?? p.price, cost: e.cost ?? p.cost }
  const w = weekOf(p)
  return {
    ...next,
    supplierName: supplier(p.supplierId)?.name ?? "—",
    level: stockOf(next),
    margin: marginOf(next.price, next.cost),
    sold: w.sold,
    returned: w.returned,
    rate: w.sold === 0 ? 0 : w.returned / w.sold,
    adsPaused: e.adsPaused === true
  }
}

const LONG = [
  "Aurora Hooded Fleece met extra lange capuchon en duimgaten · Limited Edition",
  "Coastline Bomber Jacket gerecycled nylon, waterafstotend, gevoerd",
  "Mariner Wool Beanie Merino Ribgebreid Unisex Eén Maat"
]
const BUSY: ReadonlyArray<Product> = Array.from({ length: 30 }, (_, i): Product => {
  const base = PRODUCTS[i % PRODUCTS.length] as Product
  return {
    ...base,
    id: `druk-${i + 1}`,
    name: `${LONG[i % LONG.length] ?? base.name} ${i + 1}`,
    sku: `${base.sku}-DRUK-${String(i + 1).padStart(3, "0")}`,
    stock: (i * 37) % 300,
    status: (["actief", "actief", "concept", "gearchiveerd"] as const)[i % 4] ?? "actief"
  }
})

export function productRows(view: View, s: ProductState = state): ReadonlyArray<ProductRow> {
  if (view.staat === "leeg") return []
  const rows = PRODUCTS.map((p) => rowOf(p, s))
  return view.staat === "druk" ? [...rows, ...BUSY.map((p) => rowOf(p, s))] : rows
}

export function findProduct(id: string, view: View, s: ProductState = state): ProductRow | undefined {
  const p = product(id) ?? (view.staat === "druk" ? BUSY.find((x) => x.id === id) : undefined)
  return p === undefined ? undefined : rowOf(p, s)
}

/** The counts the menu and the page both show. */
export function productCounts(view: View, s: ProductState = state) {
  const rows = productRows(view, s)
  return {
    all: rows.length,
    actief: rows.filter((r) => r.status === "actief").length,
    concept: rows.filter((r) => r.status === "concept").length,
    gearchiveerd: rows.filter((r) => r.status === "gearchiveerd").length,
    laag: rows.filter((r) => r.status === "actief" && r.level !== "op-voorraad").length,
    retour: rows.filter((r) => r.rate > 0.1).length,
    toezicht: view.staat === "leeg" ? 0 : rows.filter((r) => qualityOf(r, s).phase === "toezicht").length
  }
}

/** The product the low-stock proposal is about: the active one that runs out first at its pace. */
export function lowStockPick(rows: ReadonlyArray<ProductRow>) {
  return rows
    .filter((r) => r.status === "actief" && r.level === "laag" && !r.adsPaused)
    .map((r) => ({ row: r, days: daysLeft(r) }))
    .filter((x): x is { row: ProductRow; days: number } => x.days !== null)
    .toSorted((a, b) => a.days - b.days)[0]
}

/** "1,9" in Dutch. */
export const decimal = (n: number, digits = 1) =>
  n.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const percent = (share: number, digits = 0) =>
  `${(share * 100).toLocaleString("nl-NL", { maximumFractionDigits: digits })}%`
