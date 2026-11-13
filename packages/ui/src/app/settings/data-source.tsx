import { createContext, type ReactNode, useContext } from "react"

/**
 * What Instellingen → Je gegevens reads and does, from whoever hosts it: the design app from its demo workspace, the
 * console from `Privacy.inventory`, `Privacy.requests` and the commands beside them (M17 step 5, PLAN 48). A write
 * answers whether it took; the host says why it did not. Times are epoch milliseconds.
 */

export type DataCategoryId =
  | "customers"
  | "orders"
  | "products"
  | "support"
  | "chats"
  | "returns"
  | "chargebacks"
  | "files"
  | "team"
  | "log"

export type Level = 0 | 1 | 2 | 3

export interface DataInventory {
  categories: ReadonlyArray<{ id: DataCategoryId; count: number }>
  countedAt: number
  places: ReadonlyArray<{ what: string; where: string }>
  subProcessors: ReadonlyArray<{ name: string; purpose: string; where: string; outsideEu: boolean }>
  roles: ReadonlyArray<{
    id: string
    label: string
    members: number
    customers: Level
    orders: Level
    support: Level
    exports: boolean
    someStores: boolean
  }>
}

export type RequestState = "open" | "running" | "ready" | "failed" | "waiting" | "done" | "cancelled"

export type ExportSchedule = "off" | "weekly" | "monthly"

export interface ExportEntry {
  id: string
  source: "operator" | "insyte"
  state: RequestState
  requestedBy: string | null
  requestedAt: number
  readyAt: number | null
  /** Where the file is, while it may still be downloaded. */
  href: string | null
  sizeBytes: number | null
  expiresAt: number | null
}

export interface ShopperRequestEntry {
  id: string
  kind: "access" | "erasure"
  source: "shopify" | "operator"
  subject: string | null
  state: RequestState
  receivedAt: number
  dueAt: number
  completedAt: number | null
  href: string | null
}

export interface DataRequests {
  schedule: ExportSchedule
  exports: ReadonlyArray<ExportEntry>
  shoppers: ReadonlyArray<ShopperRequestEntry>
  deletion: { requestedAt: number; requestedBy: string | null; dueAt: number } | null
}

export interface DataSource {
  workspaceName: string
  inventory: DataInventory
  requests: DataRequests
  /** The viewer owns the workspace: the full export, its schedule and the deletion are theirs. */
  owner: boolean
  /** Exporteren and Klanten · Bekijken: a shopper's package. */
  mayRequestAccess: boolean
  /** Klanten · Beheren: erasing a shopper. */
  mayErase: boolean
  requestExport: () => Promise<boolean>
  setSchedule: (schedule: ExportSchedule) => Promise<boolean>
  /** "Gegevens opvragen" by address, or answering a request Shopify sent. */
  requestAccess: (by: { email: string } | { requestId: string }) => Promise<boolean>
  requestErasure: (email: string) => Promise<boolean>
  requestDeletion: (confirmName: string) => Promise<boolean>
  cancelDeletion: () => Promise<boolean>
}

const DataContext = createContext<DataSource | null>(null)

export function DataSourceProvider({ value, children }: { value: DataSource; children: ReactNode }) {
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useDataSource(): DataSource {
  const source = useContext(DataContext)
  if (source === null) throw new Error("useDataSource outside a DataSourceProvider")
  return source
}
