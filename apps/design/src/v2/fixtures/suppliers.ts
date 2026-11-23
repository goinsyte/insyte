import { useSyncExternalStore } from "react"
import type { Tone } from "../ui/badge.tsx"
import type { View } from "../view.ts"
import { supplier, supplierOrders, supplierProducts, SUPPLIERS } from "./records.ts"
import type { Order, Product, Supplier } from "./records.ts"
import { DEMO_NOW } from "./workspace.ts"
import type { PEOPLE } from "./workspace.ts"

/**
 * Leveranciers: the suppliers of `records.ts` as the suppliers area reads them. Their open and late
 * orders and products come from the shared records; what only this area knows is here: who the
 * contact is, who on the team follows them up, the share shipped on time, how orders reach them and
 * what their portal shows. What the operator changes in the demo (a pause, an invite, the portal's
 * parts, how orders go) lives in the store at the foot.
 */

export type PortalStatus = "actief" | "uitgenodigd" | "geen"

export const PORTAL: Readonly<Record<PortalStatus, { readonly label: string; readonly tone: Tone }>> = {
  actief: { label: "Actief", tone: "good" },
  uitgenodigd: { label: "Uitgenodigd", tone: "warn" },
  geen: { label: "Niet uitgenodigd", tone: "neutral" }
}

export type Via = "portaal" | "email" | "api"

export const VIA: Readonly<Record<Via, string>> = { portaal: "Portaal", email: "E-mail", api: "API" }

export type Feed = "live" | "ja-nee" | "geen"

export const FEED: Readonly<Record<Feed, string>> = {
  live: "Live",
  "ja-nee": "Alleen op voorraad of niet",
  geen: "Geen"
}

/** What a supplier sees in its portal (`lib/team-core.ts`'s `PORTAL_SCOPES`). */
export const PORTAL_SCOPES: ReadonlyArray<
  { readonly id: string; readonly label: string; readonly detail: string; readonly fixed?: boolean }
> = [
  {
    id: "orders",
    label: "Bestellingen met hun producten",
    detail: "Hun regels, de kostprijs en het verzendadres. Nooit het e-mailadres of telefoonnummer van de klant.",
    fixed: true
  },
  { id: "stock", label: "Voorraad en levertijd bijwerken", detail: "Wat ze opgeven zie je terug op de productpagina." },
  { id: "statements", label: "Afrekeningen", detail: "Wat Northwind per maand voor hun regels betaalt." },
  { id: "chat", label: "Chat met jullie team", detail: "Eén gedeeld kanaal, zichtbaar aan beide kanten." },
  {
    id: "media",
    label: "Productfoto's en video's aanleveren",
    detail: "Ze verschijnen bij het product als aangeleverd door de leverancier."
  }
]

type Extra = {
  readonly contact: string
  /** Who on the team follows this supplier up. */
  readonly owner: keyof typeof PEOPLE
  /** Share of last month's shipments handed over on time; null when nothing shipped yet. */
  readonly onTime: number | null
  readonly feed: Feed
  readonly portal: PortalStatus
  readonly via: Via
  readonly auto: boolean
  readonly scopes: ReadonlyArray<string>
  readonly supplies: string
  readonly invitedAt?: string
}

const ALL_SCOPES = PORTAL_SCOPES.map((s) => s.id)

const EXTRA: Readonly<Record<string, Extra>> = {
  "allure-fulfillment": {
    contact: "Marco Rossi",
    owner: "sofia",
    onTime: 0.96,
    feed: "live",
    portal: "actief",
    via: "api",
    auto: true,
    scopes: ALL_SCOPES,
    supplies: "Fleece, sweaters en basics"
  },
  "dpc-apparel": {
    contact: "Inês Carvalho",
    owner: "ethan",
    onTime: 0.91,
    feed: "ja-nee",
    portal: "geen",
    via: "email",
    auto: false,
    scopes: ALL_SCOPES,
    supplies: "Shirts, broeken en accessoires"
  },
  "kestrel-goods": {
    contact: "Noor Visser",
    owner: "ethan",
    onTime: 0.58,
    feed: "live",
    portal: "geen",
    via: "api",
    auto: true,
    scopes: ALL_SCOPES,
    supplies: "Jassen en tassen"
  },
  "black-cedar-studio": {
    contact: "Joris de Graaf",
    owner: "maya",
    onTime: 0.94,
    feed: "geen",
    portal: "actief",
    via: "portaal",
    auto: false,
    scopes: ["orders", "stock", "chat"],
    supplies: "Leer en accessoires"
  },
  "noord-atelier": {
    contact: "Saar Visser",
    owner: "elena",
    onTime: null,
    feed: "geen",
    portal: "uitgenodigd",
    via: "portaal",
    auto: false,
    scopes: ALL_SCOPES,
    supplies: "Linnen en katoen",
    invitedAt: "vr 20 nov"
  }
}

const FALLBACK: Extra = {
  contact: "—",
  owner: "elena",
  onTime: null,
  feed: "geen",
  portal: "geen",
  via: "email",
  auto: false,
  scopes: ALL_SCOPES,
  supplies: "—"
}

/* ── the demo's own changes ────────────────────────────────────────────────────────────────────── */

export type SupplierEdit = {
  readonly paused?: boolean
  readonly portal?: PortalStatus
  readonly invitedTo?: string
  readonly via?: Via
  readonly auto?: boolean
  readonly scopes?: ReadonlyArray<string>
}

export type SupplierState = { readonly edits: Readonly<Record<string, SupplierEdit>> }

let state: SupplierState = { edits: {} }
const listeners = new Set<() => void>()

export function setSupplierState(next: (s: SupplierState) => SupplierState) {
  state = next(state)
  for (const l of listeners) l()
}

export function editSupplier(id: string, patch: SupplierEdit) {
  setSupplierState((s) => ({ edits: { ...s.edits, [id]: { ...s.edits[id], ...patch } } }))
}

export function useSupplierState(): SupplierState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}

export const getSupplierState = () => state

/* ── rows ──────────────────────────────────────────────────────────────────────────────────────── */

const OPEN: ReadonlySet<Order["status"]> = new Set(["betaald", "bij-leverancier", "verzonden", "vertraagd"])

export type SupplierRow = Supplier & Extra & {
  readonly products: ReadonlyArray<Product>
  readonly open: ReadonlyArray<Order>
  readonly late: ReadonlyArray<Order>
  readonly paused: boolean
}

function rowOf(s: Supplier, st: SupplierState): SupplierRow {
  const e = st.edits[s.id] ?? {}
  const x = EXTRA[s.id] ?? FALLBACK
  const orders = supplierOrders(s.id)
  const portal = e.portal ?? x.portal
  return {
    ...s,
    ...x,
    status: e.paused === true ? "gepauzeerd" : s.status,
    portal,
    via: e.via ?? x.via,
    auto: e.auto ?? x.auto,
    scopes: e.scopes ?? x.scopes,
    products: supplierProducts(s.id),
    open: orders.filter((o) => OPEN.has(o.status)),
    late: orders.filter((o) => o.status === "vertraagd"),
    paused: e.paused === true
  }
}

const LONG = [
  "Guangzhou Huameng Textile & Garment Manufacturing Co., Ltd.",
  "Vereinigte Strickwarenfabriken Oberlausitz GmbH & Co. KG",
  "Confecções Têxteis do Vale do Ave, Lda."
]
const BUSY: ReadonlyArray<Supplier> = Array.from({ length: 12 }, (_, i): Supplier => {
  const base = SUPPLIERS[i % 4] as Supplier
  return {
    ...base,
    id: `druk-${i + 1}`,
    name: `${LONG[i % LONG.length] ?? base.name} ${i + 1}`,
    email: `orders.department.${i + 1}@very-long-supplier-domain.example.com`,
    leadDays: 3 + ((i * 7) % 50) / 10
  }
})

export function supplierRows(view: View, st: SupplierState = state): ReadonlyArray<SupplierRow> {
  if (view.staat === "leeg") return []
  const rows = SUPPLIERS.map((s) => rowOf(s, st))
  return view.staat === "druk" ? [...rows, ...BUSY.map((s) => rowOf(s, st))] : rows
}

export function findSupplier(id: string, view: View, st: SupplierState = state): SupplierRow | undefined {
  const s = supplier(id) ?? (view.staat === "druk" ? BUSY.find((x) => x.id === id) : undefined)
  return s === undefined ? undefined : rowOf(s, st)
}

/** The counts the menu and the page both show. */
export function supplierCounts(view: View, st: SupplierState = state) {
  const rows = supplierRows(view, st)
  return {
    all: rows.length,
    late: rows.filter((r) => r.late.length > 0).length,
    /** Distinct late orders over every supplier (an order with two suppliers' lines counts once). */
    lateOrders: new Set(rows.flatMap((r) => r.late.map((o) => o.number))).size,
    slow: rows.filter((r) => r.leadDays > r.promiseDays).length,
    invited: rows.filter((r) => r.portal === "uitgenodigd").length,
    api: rows.filter((r) => r.apiConnected).length
  }
}

/** Days an order has been on its way, as a person counts them: a started day counts. */
export const daysUnderway = (o: Order) => Math.ceil((DEMO_NOW.date.getTime() - o.placedAt.getTime()) / 86_400_000)

export const decimal = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** The Kestrel follow-up the Leveranciersopvolger drafted (`fixtures/home.ts`, `mail-kestrel`). */
export const KESTREL_PROPOSAL = "mail-kestrel"
