import { type ComponentType, createContext, useContext } from "react"
import type { Address, Currency, Order, OrderLineItem } from "../lib/types/domain"
import type { TeamGate } from "./source"

/**
 * What one order's detail reads and does, from whoever hosts it (as `source.tsx` is for the list): the design app from
 * its demo workspace, the console from `Orders.get` (M6.4). The record's markup is the design's; its facts, and what
 * the order may become, are the host's (the console's commands since M7.1). Where a part is absent the screen leaves it
 * out: the console has no agent rows yet.
 */

/** One step of the order's history, newest last; the screen gives each kind its icon. */
export type TimelineStep = {
  kind: "placed" | "paid" | "supplier" | "shipped" | "delivered" | "closed"
  done: boolean
  label: string
  detail: string
}

/** What the order may become, each behind the gate the role holds for it. */
export interface OrderWrites {
  gates: { edit: TeamGate; refund: TeamGate; returns: TeamGate }
  /** What is still refundable, where the host knows it (after an earlier partial refund); the order's total else. */
  refundable?: number | undefined
  fulfil: () => void
  refund: () => void
  cancel: () => void
  saveNote: (note: string) => void
  saveShipping: (address: Address) => void
  /** Insyte's advice on a slow supplier, turned into a message to that supplier. */
  draftSupplierMessage: (supplier: string) => void
}

export interface OrderDetailSource {
  /** The order with its lines. */
  order: Order
  /** The customer as the sidebar sums them up; absent for a guest order. */
  customer?:
    | { orders_count: number; lifetime_value: number; currency?: Currency | undefined; phone?: string }
    | undefined
  /** A line's photograph and SKU, where the host knows them. */
  imageOf: (line: OrderLineItem) => string | undefined
  skuOf: (line: OrderLineItem) => string | undefined
  /** The totals under the lines; `discount` shows only when there was one. */
  totals: { subtotal: number; shipping: number; tax: number; discount: number }
  timeline: ReadonlyArray<TimelineStep>
  /** How it was paid, and when it was collected (absent while it is not). */
  payment: { method: string; collectedAt?: string | undefined }
  /** The supplier who fulfils it, where the host knows (M8 in the console). */
  supplier?: string | undefined
  /**
   * True while the host is still reading the record (opened from the list, the header is the row it already has);
   * absent where the body arrives at the reference's simulated pace (the design app).
   */
  arriving?: boolean | undefined
  /** The shopper's own note from the checkout, where the host has one: shown apart from the team's internal note. */
  checkoutNote?: string | undefined
  /** The labels other orders use, offered while typing; `write` absent where labels cannot be changed yet. */
  tags: {
    known: ReadonlyArray<string>
    write?: ((tags: string[], message: string) => void) | undefined
  }
  writes?: OrderWrites | undefined
  /** The forwarding tracker above the lines, the agents' rows under the timeline, and the order's returns. */
  Tracker?: ComponentType<{ order: Order }> | undefined
  AgentRows?: ComponentType<{ order: Order }> | undefined
  Returns?:
    | {
      Dialog: ComponentType<{ order: Order; open: boolean; onClose: () => void }>
      Panel: ComponentType<{ order: Order; onStart: () => void }>
    }
    | undefined
}

const OrderDetailSourceContext = createContext<OrderDetailSource | null>(null)

export const OrderDetailSourceProvider = OrderDetailSourceContext.Provider

export function useOrderDetailSource(): OrderDetailSource {
  const source = useContext(OrderDetailSourceContext)
  if (source === null) throw new Error("An order's detail needs an OrderDetailSourceProvider around it.")
  return source
}
