import { type ComponentType, createContext, type ReactNode, useContext } from "react"
import type { Due, ProblemKind, SupplierStatus } from "../lib/supplier-work"
import type { StockIndicator } from "../stores/supplier-store"

/**
 * What the supplier portal's screens read and do, from whoever hosts them (as `suppliers/source.tsx` is for the
 * brand's suppliers page): the design app from its demo stores (`demo-source.tsx`), the console from
 * `SupplierPortal.*` (M16 step 2), where a supplier's contact signs in to one brand. The markup is the design's. A
 * supplier sees only its own lines, what the brand pays for them and where they go: never another supplier's lines,
 * the order's total or the customer's email and phone. Amounts are in whole units of the order's currency, formatted
 * by the host's `money`.
 */

/** One of the supplier's own lines on an order. */
export type SupplierLine = {
  id: string
  productId: string | null
  title: string
  variantTitle: string | null
  /** What the line is picked by: its SKU, or the variant's id where there is none. */
  sku: string
  quantity: number
}

/** An order as the supplier's lists show it. */
export type SupplierOrderRow = {
  id: string
  number: string
  lines: ReadonlyArray<SupplierLine>
  units: number
  status: SupplierStatus
  due: Due
  /** When it has to be with the carrier. */
  handoff: Date
  /** "Jouw bedrag": what the brand pays for these lines. */
  amount: number
  /** A line has no cost price yet, so `amount` leaves it out. */
  costMissing: boolean
  city: string
  country: string
}

/** Where the parcel goes: the name and the address, nothing else about the customer. */
export type ShipTo = {
  name: string
  line1: string
  line2: string | null
  postcode: string
  city: string
  country: string
}

export type ParcelView = { id: string; carrier: string; tracking: string; at: string }

/** One order's page. Times are ISO strings. */
export type SupplierOrderView = {
  row: SupplierOrderRow
  placedAt: string
  acceptedAt: string | undefined
  problem: { kind: ProblemKind; note: string; at: string } | undefined
  parcels: ReadonlyArray<ParcelView>
  /** Shipped without a parcel of its own (the brand marked it): its carrier and tracking, where known. */
  shippedAs: { carrier: string | undefined; tracking: string | undefined } | undefined
  shipTo: ShipTo
  /** "Notitie van <merk>": the note the brand wrote for its suppliers. */
  note: string | undefined
}

/** A packing slip's page: no prices, it travels with the parcel. */
export type PackingSlip = { number: string; shipTo: ShipTo; lines: ReadonlyArray<SupplierLine> }

export type StockLevel = "available" | "low" | "out"

/** A product as the supplier's list shows it. */
export type SupplierProductRow = {
  id: string
  title: string
  image: string | undefined
  variants: number
  units: number
  stock: StockLevel
  /** Days from order to hand-off. */
  lead: number
  mode: StockIndicator
  /** Orders to accept or to ship with a line of it. */
  open: number
  /** Files the supplier shared for it. */
  media: number
}

/** One product's page. */
export type SupplierProductView = {
  row: SupplierProductRow
  images: ReadonlyArray<string>
  variants: ReadonlyArray<{ id: string; title: string; sku: string; stock: number }>
  /** Open orders with it, soonest hand-off first. */
  waiting: ReadonlyArray<{ id: string; number: string; quantity: number; handoff: Date }>
}

/** "Hoe je levert": the supplier's own parcels, week by week. */
export type SupplierPerformance = {
  weeks: ReadonlyArray<{ label: string; onTime: number; n: number; late: number }>
  onTime30: number
  parcels30: number
  /** Days late, on average, of the late ones. */
  lateBy: number
  /** "Op tijd bezorgd" or "Op tijd overgedragen": what the host measures. */
  measure: string
  /** The last week's end, "26 mei". */
  until: string
}

export type SupplierDashboardView = {
  counts: { accept: number; today: number; late: number; problem: number }
  /** No order yet: the first day's page. */
  fresh: boolean
  /** "Eerst dit": late, today, to accept, then the rest (at most seven). */
  work: ReadonlyArray<SupplierOrderRow>
  /** "Bijna op": low or sold out, lowest first. */
  low: ReadonlyArray<{ id: string; title: string; units: number }>
  performance: SupplierPerformance
  /** The last word in the shared chat; absent, there is no chat to show. */
  lastMessage?: { who: string; body: string; at: string } | undefined
}

/** What a write says when it is done, with "Ongedaan maken" where the host can take it back. */
export type Said = { message: string; description?: string | undefined }

export interface SupplierPortalSource {
  /** The brand, as the portal names it: "Northwind". */
  brand: string
  /** On the packing slip. */
  brandLegal: string
  /** The contact's first name, for the greeting. */
  firstName: string
  money: (amount: number) => string
  useOrders: () => ReadonlyArray<SupplierOrderRow>
  useOrder: (id: string) => SupplierOrderView | undefined
  useProducts: () => ReadonlyArray<SupplierProductRow>
  useProduct: (id: string) => SupplierProductView | undefined
  useDashboard: () => SupplierDashboardView
  accept: (rows: ReadonlyArray<SupplierOrderRow>, said: Said) => void
  /** Each row with its own tracking number, one carrier for the batch. */
  ship: (items: ReadonlyArray<{ row: SupplierOrderRow; tracking: string }>, carrier: string, said: Said) => void
  /** `newDate` is the supplier's `YYYY-MM-DD`, for a delay or a stock problem. */
  report: (row: SupplierOrderRow, problem: { kind: ProblemKind; note: string; newDate?: string }, said: Said) => void
  packingSlips: (rows: ReadonlyArray<SupplierOrderRow>) => void
  saveStock: (product: SupplierProductView, stock: Record<string, number>, lead: number, said: Said) => void
  setMode: (product: SupplierProductRow, mode: StockIndicator) => void
  /** The ways stock can be reported, and why one is off (no API connected); `null` where it can be picked. */
  modeOff: (mode: StockIndicator) => string | null
  /**
   * Parts of the portal a host may not have yet: the quality checks (on the dashboard and a product), the photos and
   * videos for the brand, the closing, the chat and the settings pages. `null` or `false` leaves them out.
   */
  parts: {
    CheckWork: ComponentType | null
    Checks: ComponentType<{ productId: string }> | null
    Media: ComponentType<{ productId: string }> | null
    Closing: ComponentType | null
    chat: boolean
    settings: boolean
  }
}

const SupplierPortalContext = createContext<SupplierPortalSource | null>(null)

export function SupplierPortalProvider({ value, children }: { value: SupplierPortalSource; children: ReactNode }) {
  return <SupplierPortalContext.Provider value={value}>{children}</SupplierPortalContext.Provider>
}

export function useSupplierPortal(): SupplierPortalSource {
  const source = useContext(SupplierPortalContext)
  if (source === null) throw new Error("The supplier portal needs a SupplierPortalProvider around it.")
  return source
}
