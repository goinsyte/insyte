import { type ComponentType, createContext, useContext } from "react"
import type { Stock, SupplierStats } from "../lib/catalog"
import type { Supplier } from "../lib/types/domain"
import type { RowAction } from "../table/data-table"

/**
 * What the suppliers page reads and does, from whoever hosts it (as `products/source.tsx` is for the products list):
 * the design app from its demo stores, the console from `Suppliers.list` and `Suppliers.get` (M8.1). The markup is the
 * design's; a figure the host has no source for is left out (`hidden` columns, a product's units, the restock button,
 * the portal), never made up.
 */

export type TeamGate = { ok: boolean; reason: string }

/** Where a supplier stands with the portal (`lib/team.ts`'s, spelled out so this seam reads no demo data). */
export type PortalStatus = "active" | "invited" | "none"

/** A supplier as the list shows it. */
export type SupplierRow = SupplierStats & { id: string; name: string; paused: boolean; portal: PortalStatus }

/** Complaints and checks over its products' last 90 days (M9); `over` when the rate passes the workspace's threshold. */
export type SupplierQuality = {
  rate: number
  complaints: number
  sold: number
  passed: number
  judged: number
  over: boolean
}

/** One of their products in the dialog; `units` and `stock` only where the host knows them. */
export type SupplierProductLine = { id: string; title: string; units?: number | undefined; stock?: Stock | undefined }

/** How orders reach them, and whether a paid one goes at once (forwarding). */
export type ForwardPref = { via: "portal" | "email" | "api"; auto: boolean }

/** A supplier's own API: where Insyte posts its orders, and the last connection test. */
export type ApiState = { url: string; lastPing: { ok: boolean; ms: number | null; at: number } | null } | null

export type PingOutcome = { ok: boolean; ms: number | null; reason: string | null }

/** "Nieuwe leverancier" and "Bewerken". */
export type SupplierInput = {
  name: string
  contactEmail: string
  contactPhone: string
  description: string
  leadDays: number
}

export interface SuppliersSource {
  rows: Array<SupplierRow>
  /** The line beside the title. */
  standing: (rows: ReadonlyArray<SupplierRow>) => string
  /** Columns the host has no figures for. */
  hidden: ReadonlyArray<string>
  actions: ReadonlyArray<RowAction<SupplierRow>>
  qualityOf: (id: string) => SupplierQuality | undefined
  /** "Nieuwe bestellingen pauzeren" or "hervatten", with Undo. */
  pauseOrResume: (rows: ReadonlyArray<SupplierRow>) => void
  /** The open dialog's products and late orders. */
  useDetail: (row: SupplierRow | null) => {
    products: ReadonlyArray<SupplierProductLine>
    late: ReadonlyArray<{ id: string; number: string }>
  }
  prefOf: (id: string) => ForwardPref
  setPref: (row: SupplierRow, patch: Partial<ForwardPref>, said: string) => void
  /** Whether the role may change how orders reach them. */
  forwardGate: TeamGate
  /** Their own API, when orders go to them by API; absent, the section is left out. */
  api?:
    | {
      stateOf: (id: string) => ApiState
      /** Where their API reports back (accepted, problems, parcels, stock). */
      hookOf: (id: string) => string
      /** Connects the address; answers the secret, shown this once, or `undefined` when refused. */
      connect: (row: SupplierRow, url: string) => Promise<string | undefined>
      test: (row: SupplierRow) => Promise<PingOutcome>
      disconnect: (row: SupplierRow) => void
    }
    | undefined
  /** "{n} bijbestellen"; absent, there is no restock button. */
  restock?: ((row: SupplierRow, low: ReadonlyArray<SupplierProductLine>) => void) | undefined
  /** The shared chat with them, where there is one; else "Bericht aan" is a mail. */
  chatOf: (row: SupplierRow) => string | undefined
  /** Opens that chat. */
  openChat?: ((chatId: string) => void) | undefined
  /** Where the brand reads what it owes them, month by month (M13 step 6); absent, the dialog has no such section. */
  statementsOf?: ((row: SupplierRow) => string) | undefined
  /** The portal's section in the dialog and its invite dialog; absent, the portal parts are left out. */
  portal?:
    | {
      Section: ComponentType<{ supplier: Supplier; onInvite: () => void; onClose: () => void }>
      InviteDialog: ComponentType<{ supplier: Supplier | null; onClose: () => void }>
    }
    | undefined
  canCreate: TeamGate
  /** Makes a supplier, or edits one; absent, there is no "Nieuwe leverancier" or "Bewerken". */
  save?: ((input: SupplierInput, row?: SupplierRow) => void) | undefined
  /** A row's values for "Bewerken". */
  inputOf?: ((row: SupplierRow) => SupplierInput) | undefined
  /** The first day's page, when there are no suppliers. */
  Empty: ComponentType<{ onCreate?: (() => void) | undefined }>
  Closing?: ComponentType<{ empty: boolean; onInvite: () => void }> | undefined
}

const SuppliersSourceContext = createContext<SuppliersSource | null>(null)

export const SuppliersSourceProvider = SuppliersSourceContext.Provider

export function useSuppliersSource(): SuppliersSource {
  const source = useContext(SuppliersSourceContext)
  if (source === null) throw new Error("A suppliers screen needs a SuppliersSourceProvider around it.")
  return source
}
