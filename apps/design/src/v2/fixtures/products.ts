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
  readonly name?: string
  readonly description?: string
  readonly supplierId?: string
  readonly tags?: ReadonlyArray<string>
  readonly adsPaused?: boolean
  readonly phase?: Phase
}

/** A person's verdict on a check the supplier sent in. */
export type Verdict = {
  readonly status: "goedgekeurd" | "afgekeurd"
  readonly by: string
  readonly at: string
  readonly reason?: string
}

export type ProductState = {
  readonly edits: Readonly<Record<string, ProductEdit>>
  /** Checks requested in the demo, on top of the ones below. */
  readonly checks: ReadonlyArray<QualityCheck>
  /** Verdicts given in the demo, by check. */
  readonly verdicts: Readonly<Record<string, Verdict>>
  /** Restock asked in the demo: the ticket, by product. */
  readonly restock: Readonly<Record<string, string>>
  /** When a product was last synced from Shopify in the demo. */
  readonly synced: Readonly<Record<string, string>>
  /** The low-stock proposal: open, done or discarded. */
  readonly advice: "open" | "done" | "discarded"
}

let state: ProductState = { edits: {}, checks: [], verdicts: {}, restock: {}, synced: {}, advice: "open" }
const listeners = new Set<() => void>()

export function setProductState(next: (s: ProductState) => ProductState) {
  state = next(state)
  for (const l of listeners) l()
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

/* ── what it is: category, text, photos ────────────────────────────────────────────────────────── */

export type Category = "Truien en fleece" | "Jassen" | "Shirts" | "Broeken" | "Accessoires" | "Tassen" | "Schoenen"

export const CATEGORIES: ReadonlyArray<Category> = [
  "Truien en fleece",
  "Jassen",
  "Shirts",
  "Broeken",
  "Accessoires",
  "Tassen",
  "Schoenen"
]

const CATEGORY_OF: Readonly<Record<string, Category>> = {
  "aurora-hooded-fleece": "Truien en fleece",
  "drift-crewneck": "Truien en fleece",
  "coastline-bomber-jacket": "Jassen",
  "harbor-raincoat": "Jassen",
  "cascade-puffer": "Jassen",
  "sailor-stripe-tee": "Shirts",
  "boulevard-linen-shirt": "Shirts",
  "heartland-henley": "Shirts",
  "sequoia-flannel": "Shirts",
  "field-pant-olive": "Broeken",
  "field-pant-stone": "Broeken",
  "cloud-joggers": "Broeken",
  "mariner-wool-beanie": "Accessoires",
  "switchback-cap": "Accessoires",
  "anchor-belt-tan": "Accessoires",
  "skyline-tote": "Tassen",
  "meridian-daypack": "Tassen",
  "pacific-sandal": "Schoenen"
}

/** The catalogue product a busy-week row was copied from, so it reads as the same kind of thing. */
const baseId = (id: string) =>
  id.startsWith("druk-") ? PRODUCTS[(Number(id.slice(5)) - 1) % PRODUCTS.length]?.id ?? id : id

export const categoryOf = (id: string): Category => CATEGORY_OF[baseId(id)] ?? "Accessoires"

/** The shape a product's photographs show, for the gallery's stand-in art. */
export type Silhouette = "top" | "pant" | "hat" | "belt" | "bag" | "shoe"

export function silhouetteOf(id: string): Silhouette {
  const base = baseId(id)
  if (base === "anchor-belt-tan") return "belt"
  const c = categoryOf(id)
  return c === "Broeken"
    ? "pant"
    : c === "Accessoires"
    ? "hat"
    : c === "Tassen"
    ? "bag"
    : c === "Schoenen"
    ? "shoe"
    : "top"
}

const DESCRIPTIONS: Readonly<Record<string, string>> = {
  "aurora-hooded-fleece":
    "Zachte fleece van gerecycled polyester met een ruime capuchon en duimgaten. Valt normaal; twijfel je tussen twee maten, kies dan de grotere.\n\nWassen op 30 graden, binnenstebuiten.",
  "coastline-bomber-jacket":
    "Bomberjack van gerecycled nylon, licht gevoerd en waterafstotend. Met ribboorden aan kraag, mouwen en zoom.",
  "harbor-raincoat":
    "Regenjas met getapete naden en een capuchon die je in de kraag opbergt. Waterdicht tot 10.000 mm.",
  "drift-crewneck": "Sweater met ronde hals van zware biologische katoen. Ruim van pasvorm.",
  "sailor-stripe-tee": "Klassiek streepshirt van stevige katoen, met lange mouwen.",
  "cascade-puffer": "Gewatteerde jas met vulling van gerecycled dons. Warm tot min tien graden."
}

export const descriptionOf = (p: Product) =>
  DESCRIPTIONS[baseId(p.id)] ?? `${p.name} van ${supplier(p.supplierId)?.name ?? "de leverancier"}.`

/** What each photograph shows, in the order Shopify holds them. */
const PHOTOS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "aurora-hooded-fleece": ["Voorkant", "Achterkant", "Capuchon", "Duimgat", "Label"],
  "coastline-bomber-jacket": ["Voorkant", "Achterkant", "Voering"],
  "harbor-raincoat": ["Voorkant", "Naden", "Capuchon"],
  "switchback-cap": []
}

export const photosOf = (id: string): ReadonlyArray<string> => PHOTOS[baseId(id)] ?? ["Voorkant", "Achterkant"]

/** Files a supplier added to a product in their portal. */
export const SUPPLIER_MEDIA: Readonly<
  Record<string, ReadonlyArray<{ readonly name: string; readonly size: string; readonly at: string }>>
> = {
  "aurora-hooded-fleece": [
    { name: "maattabel-aurora-2026.pdf", size: "182 kB", at: "20 nov" },
    { name: "batch-AL-2611-label.jpg", size: "1,2 MB", at: "18 nov" }
  ],
  "harbor-raincoat": [{ name: "naden-getapet.mp4", size: "14,8 MB", at: "21 nov" }]
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

export type Deliverable = "foto" | "maten" | "batch" | "video"

export const DELIVERABLE: Readonly<Record<Deliverable, string>> = {
  foto: "Foto's",
  maten: "Maten en afmetingen",
  batch: "Batchnummer",
  video: "Video"
}

/** What the supplier sent back: the photos, a video, the batch and a line of their own. */
export type Submission = {
  readonly by: string
  readonly at: string
  /** What each photo shows. */
  readonly photos: ReadonlyArray<string>
  readonly video: boolean
  readonly batch?: string
  readonly note?: string
}

export type QualityCheck = {
  /** Also the public check page: `/v2/kwaliteit/qc-301`. */
  readonly id: string
  readonly productId: string
  readonly kind: CheckKind
  readonly sizes: ReadonlyArray<string>
  readonly deliver: ReadonlyArray<Deliverable>
  readonly status: CheckStatus
  readonly requestedBy: string
  readonly requestedAt: string
  readonly due: string
  readonly late?: boolean
  readonly note: string
  readonly submission?: Submission
  /** The verdict's reason (or the approval's line), and who gave it when. */
  readonly verdict?: string
  readonly verdictBy?: string
  readonly verdictAt?: string
}

/** The checks of `mock-data/quality.ts`, on this catalogue: the Harbor under watch, the Aurora's open check. */
export const CHECKS: ReadonlyArray<QualityCheck> = [
  {
    id: "qc-301",
    productId: "aurora-hooded-fleece",
    kind: "batch",
    sizes: ["S", "M", "L"],
    deliver: ["foto", "batch", "maten"],
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
    deliver: ["foto", "batch"],
    status: "afgekeurd",
    requestedBy: PEOPLE.elena.name,
    requestedAt: "16 nov",
    due: "18 nov",
    note: "Foto's van de nieuwe batch en het batchnummer.",
    submission: {
      by: "Noor Visser",
      at: "17 nov 15:20",
      photos: ["Voorkant", "Schouder links", "Schouder rechts", "Label"],
      video: false,
      batch: "KG-2609"
    },
    verdict: "De naad bij de schouder is niet getapet, dus de jas is daar niet waterdicht. Stuur een nieuwe batch.",
    verdictBy: PEOPLE.elena.name,
    verdictAt: "18 nov 09:45"
  },
  {
    id: "qc-303",
    productId: "harbor-raincoat",
    kind: "batch",
    sizes: [],
    deliver: ["foto", "video", "batch"],
    status: "goedgekeurd",
    requestedBy: PEOPLE.elena.name,
    requestedAt: "18 nov",
    due: "22 nov",
    note: "Herstelde batch: dezelfde foto's, plus een video van de naden.",
    submission: {
      by: "Noor Visser",
      at: "21 nov 11:05",
      photos: ["Voorkant", "Schouder links", "Schouder rechts", "Binnenkant", "Zoom", "Label"],
      video: true,
      batch: "KG-2614",
      note: "Naden nu getapet, zie video."
    },
    verdict: "Naden nu getapet, zie video.",
    verdictBy: PEOPLE.elena.name,
    verdictAt: "22 nov 08:50"
  },
  {
    id: "qc-304",
    productId: "harbor-raincoat",
    kind: "monster",
    sizes: ["S", "M", "L", "XL"],
    deliver: ["foto", "maten"],
    status: "goedgekeurd",
    requestedBy: PEOPLE.sofia.name,
    requestedAt: "8 okt",
    due: "14 okt",
    note: "Monster van de eerste productie, met de maten van S tot XL.",
    submission: {
      by: "Noor Visser",
      at: "12 okt 14:00",
      photos: ["S", "M", "L", "XL", "Voorkant", "Achterkant", "Label", "Verpakking"],
      video: false
    },
    verdictBy: PEOPLE.sofia.name,
    verdictAt: "13 okt 10:15"
  },
  {
    id: "qc-305",
    productId: "meridian-daypack",
    kind: "testbestelling",
    sizes: [],
    deliver: ["foto", "video"],
    status: "aangevraagd",
    requestedBy: PEOPLE.ethan.name,
    requestedAt: "13 nov",
    due: "20 nov",
    late: true,
    note: "Verstuur de testbestelling zoals een klant hem krijgt, en film het uitpakken."
  },
  {
    id: "qc-306",
    productId: "cascade-puffer",
    kind: "batch",
    sizes: ["M", "L"],
    deliver: ["foto", "batch", "maten"],
    status: "ingestuurd",
    requestedBy: PEOPLE.sofia.name,
    requestedAt: "19 nov",
    due: "di 24 nov",
    note: "Eerste batch van de Cascade: foto's van de stiksels bij de kamers, het batchnummer en de lengte van M en L.",
    submission: {
      by: "Noor Visser",
      at: "vandaag 10:40",
      photos: ["Voorkant", "Stiksels", "Rits", "Lengte M", "Lengte L", "Label"],
      video: false,
      batch: "KG-2621",
      note: "M is 74 cm, L is 76 cm, zoals de tabel. De rits is nu van YKK."
    }
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

/** A check with the demo's verdict laid over it. */
function judged(c: QualityCheck, s: ProductState): QualityCheck {
  const v = s.verdicts[c.id]
  if (v === undefined) return c
  return {
    ...c,
    status: v.status,
    verdictBy: v.by,
    verdictAt: v.at,
    ...(v.reason === undefined ? {} : { verdict: v.reason })
  }
}

export function qualityOf(p: Product, s: ProductState = state) {
  const checks = [...s.checks.filter((c) => c.productId === p.id), ...CHECKS.filter((c) => c.productId === p.id)]
    .map((c) => judged(c, s))
  const complaints = COMPLAINTS.filter((c) => c.productId === p.id)
  const sold90 = SOLD_90[p.id] ?? weekOf(p).sold * 12
  const phase: Phase = s.edits[p.id]?.phase ?? PHASES[p.id] ?? "actief"
  const rate = sold90 === 0 ? 0 : complaints.length / sold90
  const verdicts = checks.filter((c) => c.status === "goedgekeurd" || c.status === "afgekeurd")
  return {
    checks,
    complaints,
    sold90,
    rate,
    over: rate > COMPLAINT_THRESHOLD,
    phase,
    passed: verdicts.filter((c) => c.status === "goedgekeurd").length,
    judged: verdicts.length
  }
}

/** A supplier's quality over every product they make: complaints against 90 days' sales, and checks passed. */
export function supplierQuality(supplierId: string, s: ProductState = state) {
  const mine = PRODUCTS.filter((p) => (s.edits[p.id]?.supplierId ?? p.supplierId) === supplierId)
  const each = mine.map((p) => ({ product: p, q: qualityOf(p, s) }))
  const complaints = each.reduce((n, x) => n + x.q.complaints.length, 0)
  const sold = each.reduce((n, x) => n + x.q.sold90, 0)
  const rate = sold === 0 ? 0 : complaints / sold
  return {
    complaints,
    sold,
    rate,
    over: rate > COMPLAINT_THRESHOLD,
    passed: each.reduce((n, x) => n + x.q.passed, 0),
    judged: each.reduce((n, x) => n + x.q.judged, 0),
    /** Checks still with the supplier or waiting for a verdict, with their product. */
    open: each.flatMap((x) =>
      x.q.checks.filter((c) => c.status === "aangevraagd" || c.status === "ingestuurd").map((c) => ({
        check: c,
        product: x.product
      }))
    )
  }
}

/* ── rows ──────────────────────────────────────────────────────────────────────────────────────── */

export type ProductRow = Product & {
  readonly description: string
  readonly category: Category
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
  const next: Product = {
    ...p,
    name: e.name ?? p.name,
    status: e.status ?? p.status,
    price: e.price ?? p.price,
    cost: e.cost ?? p.cost,
    supplierId: e.supplierId ?? p.supplierId,
    tags: e.tags ?? p.tags
  }
  const w = weekOf(p)
  return {
    ...next,
    description: e.description ?? descriptionOf(p),
    category: categoryOf(p.id),
    supplierName: supplier(next.supplierId)?.name ?? "—",
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
