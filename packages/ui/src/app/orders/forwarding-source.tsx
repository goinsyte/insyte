import { type ComponentType, createContext, useContext } from "react"
import type { ForwardVia } from "../lib/forwarding"
import type { QueueRow } from "../lib/queue-row"
import type { OrderLineItem } from "../lib/types/domain"
import type { Facet } from "../table/data-table"

/**
 * What the forwarding queue reads and does, from whoever hosts it: the design app from its forwarding store, the console
 * from `Forwarding.list` (M8.2). The markup is the design's. A part the host has no source for is left out: the agent's
 * plate and log row (M15), "Klant mailen" (until `Orders.emailCustomer`).
 */

export type TeamGate = { ok: boolean; reason: string }

export interface ForwardingSource {
  /** The clock the waiting times read; the host ticks it every second while a send waits out its window. */
  now: number
  /** Every leg not cancelled, with its order and lines, as of `now`. */
  all: ReadonlyArray<QueueRow>
  supplierLabel: (id: string) => string
  /** A line's product photograph, where the host has one. */
  imageOf: (line: OrderLineItem) => string | undefined
  facets: ReadonlyArray<Facet>
  gates: { edit: TeamGate }
  /** How a supplier takes its orders unless the dialog says otherwise. */
  viaOf: (supplierId: string) => ForwardVia
  /** "Doorsturen", with its Undo. */
  forward: (rows: ReadonlyArray<QueueRow>, via: Partial<Record<string, ForwardVia>>, note: string) => void
  /** "Als bevestigd markeren", with its Undo. */
  confirm: (rows: ReadonlyArray<QueueRow>) => void
  /** Who else could take this leg ("Andere leverancier"). */
  rerouteOptions: (row: QueueRow) => ReadonlyArray<{ id: string; name: string }>
  reroute: (row: QueueRow, supplierId: string) => void
  /** "Bestelling annuleren" on a failed row: the whole order, in Shopify. */
  cancelOrder: (row: QueueRow) => void
  /** "Klant mailen"; absent, the button is left out. */
  mail?: { gate: TeamGate; send: (row: QueueRow, subject: string, body: string) => void } | undefined
  /** The agent's ForwardOrder plate above Te versturen, and its log row; absent, neither shows. */
  Plate?: ComponentType<{ toForward: ReadonlyArray<QueueRow> }> | undefined
  Recent?: ComponentType | undefined
}

const ForwardingSourceContext = createContext<ForwardingSource | null>(null)

export const ForwardingSourceProvider = ForwardingSourceContext.Provider

export function useForwardingSource(): ForwardingSource {
  const source = useContext(ForwardingSourceContext)
  if (source === null) throw new Error("The forwarding queue needs a ForwardingSourceProvider around it.")
  return source
}
