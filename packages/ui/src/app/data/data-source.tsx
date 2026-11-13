import { createContext, type ReactNode, useContext } from "react"
import type { Order } from "../lib/types/domain"
import type { EndpointState } from "../lib/webhooks-core"

/**
 * What the Data hub reads and does, from whoever hosts it: the design app from its demo stores (`data-demo-source.tsx`:
 * the workspace's orders, the files imported in this browser, the developer store), the console from `Data.*` (M14
 * step 5), where a file is read and kept on the server and an export is written by the jobs Worker and downloads for
 * seven days. The markup is the design's; what a host cannot do is greyed out with why.
 */

export type OrderColumn =
  | "number"
  | "customer"
  | "email"
  | "total"
  | "currency"
  | "status"
  | "payment"
  | "fulfillment"
  | "items"
  | "tracking"
  | "placed"

export const STATUS_LABEL: Record<string, string> = {
  placed: "Geplaatst",
  paid: "Betaald",
  at_supplier: "Bij leverancier",
  shipped: "Verzonden",
  delivered: "Bezorgd",
  refunded: "Terugbetaald",
  cancelled: "Geannuleerd"
}

export const PAYMENT_LABEL: Record<Order["payment_status"], string> = {
  pending: "In afwachting",
  paid: "Betaald",
  refunded: "Terugbetaald",
  voided: "Vervallen"
}

export const FULFILMENT_LABEL: Record<Order["fulfillment_status"], string> = {
  unfulfilled: "Niet afgehandeld",
  partial: "Deels afgehandeld",
  fulfilled: "Afgehandeld",
  returned: "Retour"
}

/** The order columns Exporteren offers, as the file names and writes them (the server writes the same). */
export const EXPORT_COLUMNS: ReadonlyArray<{
  id: OrderColumn
  label: string
  read: (o: Order) => string | number
}> = [
  { id: "number", label: "Bestelling", read: (o) => o.number },
  { id: "customer", label: "Klant", read: (o) => o.customer_name },
  { id: "email", label: "E-mail", read: (o) => o.customer_email },
  { id: "total", label: "Totaal", read: (o) => o.total },
  { id: "currency", label: "Valuta", read: (o) => o.currency },
  { id: "status", label: "Status", read: (o) => STATUS_LABEL[o.status] ?? o.status },
  { id: "payment", label: "Betaling", read: (o) => PAYMENT_LABEL[o.payment_status] },
  { id: "fulfillment", label: "Afhandeling", read: (o) => FULFILMENT_LABEL[o.fulfillment_status] },
  { id: "items", label: "Artikelen", read: (o) => o.line_count ?? o.line_items.length },
  { id: "tracking", label: "Track & trace", read: (o) => o.tracking_number ?? "" },
  { id: "placed", label: "Geplaatst", read: (o) => o.created_at }
]

/** The overview's figures. */
export type DataCounts = {
  orders: number
  importedRows: number
  imports: number
  stores: { live: number; total: number }
  integrations: { connected: number; total: number }
}

/** An imported file, in Tabel and Exporteren. */
export type DataImport = {
  id: string
  fileName: string
  header: ReadonlyArray<string>
  rowCount: number
  /** ISO: when it came in. */
  at: string
}

/** A file on its way in: being read, or read with its first rows, waiting for "N rijen importeren". */
export type DataPending =
  | { state: "reading"; fileName: string }
  | {
    state: "ready"
    fileName: string
    header: ReadonlyArray<string>
    firstRows: ReadonlyArray<ReadonlyArray<string>>
    rowCount: number
    busy: boolean
  }

/** An export asked for, as "Recente exports" lists it. */
export type DataExport = {
  id: string
  fileName: string
  state: "queued" | "running" | "ready" | "failed" | "expired"
  done: number
  total: number | null
  /** ISO: when it was asked for. */
  at: string
  /** ISO: when its file is removed. */
  expiresAt: string | null
  /** "Downloaden", while its file is there. */
  download?: (() => void) | undefined
}

/** What "CSV downloaden" asks for: the source and its columns (an order column's id, or an imported column's index). */
export type ExportAsk = {
  source: "orders" | { import: string }
  columns: ReadonlyArray<string>
}

/** A host's action that may be unavailable there, with why. */
export type Maybe<A extends Array<unknown> = []> = ((...args: A) => void | Promise<void>) | { reason: string }

/** As the workspace store has it. */
export type IntegrationStatus = "connected" | "disconnected" | "action_required" | "connecting"

export type DataIntegration = {
  key: string
  name: string
  description: string
  status: IntegrationStatus
  /** ISO: when it last synced. */
  syncedAt?: string | undefined
  sync: Maybe
}

export type DataStore = {
  id: string
  name: string
  domain: string
  live: boolean
  /** Its orders, where the host counts them per store. */
  orders: number | null
  /** ISO. */
  syncedAt?: string | undefined
  /** 0–100 while a sync runs. */
  progress?: number | undefined
  sync: Maybe
}

export type DataEndpoint = { id: string; url: string; events: number; rate: number | null; state: EndpointState }

export type DataKey = { id: string; label: string; prefix: string; lastUsedAt?: string | undefined }

/** Whether the role may do a thing, and what it misses when not. */
export type DataGate = { ok: boolean; reason: string }

export interface DataSource {
  /** Data · Importeren (level 2): bringing a file in, and taking one out. */
  canImport: DataGate
  /** Data · Exporteren (`data.export`). */
  canExport: DataGate
  counts: DataCounts
  /** Tabel's orders: every one the host holds, newest first. */
  orders: ReadonlyArray<Order>
  imports: ReadonlyArray<DataImport>
  /** An imported file's rows for Tabel and the export's preview; `undefined` while they load, or for `null`. */
  useImportRows: (id: string | null) => ReadonlyArray<ReadonlyArray<string>> | undefined
  pending: DataPending | null
  /** A dropped or picked file. */
  take: (file: File) => void
  /** "Geen bestand bij de hand? Gebruik een voorbeeld"; absent where there is none. */
  sample?: (() => void) | undefined
  cancel: () => void
  commit: () => void
  remove: (row: DataImport) => void
  /** "CSV downloaden". */
  exportFile: (ask: ExportAsk) => void
  /** Whether an export is being asked for or written right now. */
  exporting: boolean
  exports: ReadonlyArray<DataExport>
  integrations: ReadonlyArray<DataIntegration>
  /** Whether Instellingen → Koppelingen exists on this host. */
  manageIntegrations: boolean
  stores: ReadonlyArray<DataStore>
  endpoints: ReadonlyArray<DataEndpoint>
  keys: ReadonlyArray<DataKey>
}

const DataSourceContext = createContext<DataSource | null>(null)

export function DataSourceProvider({ value, children }: { value: DataSource; children: ReactNode }) {
  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>
}

export function useDataSource(): DataSource {
  const source = useContext(DataSourceContext)
  if (source === null) throw new Error("useDataSource outside a DataSourceProvider")
  return source
}
