import type { CustomerDetail, CustomerRow } from "@insyte/modules/customers/domain/Customers"
import type { CustomerDetailSource } from "@insyte/ui/app/customers/detail-source"
import type { Currency, Order } from "@insyte/ui/app/lib/types/domain"
import { customerOf } from "./customers-source.ts"

/*
 * One customer's source in the console (M6.4): `Customers.get` as the design's profile, with the newest 50 orders
 * Insyte holds for them. Read-only until the commands (M7): no "Nieuw ticket" (tickets are M9), no merges, no
 * Klaviyo line, no returns.
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
    payment_status: "paid",
    fulfillment_status: "unfulfilled",
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
