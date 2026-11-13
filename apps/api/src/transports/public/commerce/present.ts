import type { CustomerPage, CustomerRow } from "@insyte/modules/customers/domain/Customers"
import type { OrderPage, OrderRow } from "@insyte/modules/orders/domain/Orders"
import type { ProductPage, ProductRow } from "@insyte/modules/products/domain/Products"
import { iso } from "../shared/time.ts"

/* The commerce mirror in the public shape (M6.4, M19.2): an order, a product and a customer row, and their pages. */

/** An order row in the public shape. */
export const orderV1 = (o: OrderRow) => ({
  id: o.id,
  number: o.number,
  store_id: o.storeId,
  customer: { id: o.customerId, name: o.customerName, email: o.customerEmail },
  status: o.status,
  payment_status: o.paymentStatus,
  fulfillment_status: o.fulfillmentStatus,
  total: { amount_minor: o.totalMinor, currency: o.currency },
  tags: [...o.tags],
  line_count: o.lineCount,
  tracking: o.trackingNumber === null ? null : { carrier: o.carrier, number: o.trackingNumber },
  placed_at: iso(o.placedAt)!,
  updated_at: iso(o.updatedAt)!
})

const productV1 = (p: ProductRow) => ({
  id: p.id,
  store_id: p.storeId,
  title: p.title,
  handle: p.handle,
  status: p.status,
  vendor: p.vendor,
  product_type: p.productType,
  tags: [...p.tags],
  image: p.image,
  variant_count: p.variantCount,
  price: { min_minor: p.priceMinMinor, max_minor: p.priceMaxMinor, currency: p.currency },
  available: p.available,
  updated_at: iso(p.updatedAt)!
})

const customerV1 = (c: CustomerRow) => ({
  id: c.id,
  store_id: c.storeId,
  name: c.name,
  email: c.email,
  phone: c.phone,
  country: c.country,
  tags: [...c.tags],
  orders_count: c.ordersCount,
  lifetime_value: { amount_minor: c.lifetimeValueMinor, currency: c.currency },
  last_order_at: iso(c.lastOrderAt),
  updated_at: iso(c.updatedAt)!
})

export const orderPageV1 = (page: OrderPage) => ({
  data: page.rows.map(orderV1),
  next_cursor: page.nextCursor,
  total: page.counts.total
})

export const productPageV1 = (page: ProductPage) => ({
  data: page.rows.map(productV1),
  next_cursor: page.nextCursor,
  total: page.counts.total
})

export const customerPageV1 = (page: CustomerPage) => ({
  data: page.rows.map(customerV1),
  next_cursor: page.nextCursor,
  total: page.counts.total
})
