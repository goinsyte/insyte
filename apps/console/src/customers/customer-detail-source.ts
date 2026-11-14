import { useAtomSet } from "@effect/atom-react"
import type { CustomerDetail, CustomerRow } from "@insyte/modules/customers/domain/Customers"
import type { CustomerDetailSource } from "@insyte/ui/app/customers/detail-source"
import type { Currency, Order } from "@insyte/ui/app/lib/types/domain"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { toast } from "sonner"
import { TICKETS, ticketWrites } from "../data/tickets.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"
import { customerOf } from "./customers-source.ts"

/*
 * One customer's source in the console (M6.4): `Customers.get` as the design's profile, with the newest 50 orders
 * Insyte holds for them (their status, payment and fulfilment as Shopify has them) and the profiles merged into it, or
 * the one it went into (M7.4). The Klaviyo line is the newest sync that sent them (M7.5). "Nieuw ticket" opens a
 * follow-up ticket about them on the board where the role may open tickets; the route adds their returns.
 */

const iso = (ms: number) => new Date(ms).toISOString()

export function consoleCustomerDetail(d: CustomerDetail): CustomerDetailSource {
  const c = d.customer
  const orders = d.orders.map((o): Order => ({
    id: o.id,
    number: o.number,
    store_id: c.storeId,
    shopify_id: "",
    customer_id: c.id,
    customer_name: c.name,
    customer_email: c.email ?? "",
    status: o.status as Order["status"],
    // The design knows no partial refund: still paid, as the orders list reads it.
    payment_status: o.paymentStatus === "partially_refunded" ? "paid" : o.paymentStatus,
    fulfillment_status: o.fulfillmentStatus,
    total: o.totalMinor / 100,
    currency: o.currency as Currency,
    line_items: [],
    tags: [],
    created_at: iso(o.placedAt),
    updated_at: iso(o.placedAt)
  }))
  return {
    customer: customerOf(c),
    orders,
    currency: c.currency as Currency,
    lastOrderAt: c.lastOrderAt === null ? undefined : iso(c.lastOrderAt),
    ...(d.klaviyo === null ? {} : { klaviyo: { list: d.klaviyo.list, at: iso(d.klaviyo.at) } }),
    ...(d.merged.into === null && d.merged.absorbed === 0
      ? {}
      : {
        merged: {
          into: d.merged.into ?? undefined,
          absorbed: d.merged.absorbed,
          alsoEmails: d.merged.alsoEmails
        }
      }),
    arriving: false
  }
}

/** The profile while `Customers.get` is still out: the list's row draws the header, the record's skeleton the body. */
export function arrivingCustomerDetail(row: CustomerRow): CustomerDetailSource {
  return {
    customer: customerOf(row),
    orders: [],
    currency: row.currency as Currency,
    arriving: true
  }
}

/** "Nieuw ticket": a follow-up about them on the board, related to them; `undefined` where the role may not. */
export function useCustomerNewTicket(d: CustomerDetail): (() => void) | undefined {
  const gate = useGate("support", 2)
  const create = useAtomSet(ticketWrites.create, { mode: "promiseExit" })
  const navigate = useNavigate()
  if (!gate.ok) return undefined
  const c = d.customer
  return () =>
    void create({
      payload: {
        title: `Opvolgen met ${c.name}`.slice(0, 200),
        description: `${c.name}${c.email === null ? "" : ` · ${c.email}`}. Tot nu toe ${c.ordersCount} ${
          c.ordersCount === 1 ? "bestelling" : "bestellingen"
        }.`,
        related: { type: "customer", id: c.id }
      },
      reactivityKeys: [...TICKETS]
    }).then((exit) => {
      if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), { gone: "Deze klant bestaat niet meer" })
      const ticket = exit.value.tickets[0]
      if (ticket === undefined) return
      toast.success(`#${ticket.number} geopend voor ${c.name}`, {
        action: {
          label: "Openen",
          onClick: () => void navigate({ to: "/tickets", search: { ticket: ticket.id } as never })
        }
      })
    })
}
