import { Option, Schema } from "effect"

/*
 * The commerce mirror's shapes (M6.3; integrations.md §2 "Backfill", domain.md §4): the bulk queries Insyte runs, and
 * one JSONL line of their result turned into the row it becomes. A bulk result flattens nested connections: a variant
 * or an order's line item is its own line, after its parent, carrying `__parentId`. So a line is classified by its
 * gid's type and keeps its parent's Shopify id; the upsert finds the parent's row by that id (the parent was written
 * first, in this page or an earlier one). Lists that are not connections (fulfilments, refunds) come inline with the
 * order. Amounts arrive as decimal strings and are kept in minor units of the currency.
 */

/** `gid://shopify/Order/123` → `123`, the number webhooks send too. */
export const gidId = (gid: string): string => gid.slice(gid.lastIndexOf("/") + 1)

/** `gid://shopify/ProductVariant/1` → `ProductVariant`. */
export const gidType = (gid: string): string => gid.split("/")[3] ?? ""

/** ISO 4217 currencies without minor units (Shopify's set); the rest have two. */
const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF"
])

/** `"12.34"` in EUR → `1234`; exact on the decimal string, never through a float multiply. */
export const toMinor = (amount: string | number, currency: string): number => {
  const digits = ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
  const [whole = "0", fraction = ""] = String(amount).trim().replace(/^-/, "").split(".")
  const sign = String(amount).trim().startsWith("-") ? -1 : 1
  const padded = (fraction + "0".repeat(digits)).slice(0, digits)
  return sign * Number(`${whole}${padded}`)
}

/* ─── The queries (API 2026-10): one selection per object, for bulk and single reads ─── */

const PRODUCT_FIELDS = `id title handle descriptionHtml status vendor productType tags createdAt updatedAt
  featuredMedia { preview { image { url } } }`
const VARIANT_FIELDS = "id title sku price compareAtPrice position inventoryItem { id }"
const CUSTOMER_FIELDS = `id firstName lastName displayName tags numberOfOrders createdAt updatedAt
  defaultEmailAddress { emailAddress marketingState }
  defaultPhoneNumber { phoneNumber }
  amountSpent { amount currencyCode }
  defaultAddress { address1 address2 city zip province countryCodeV2 }`
const ORDER_FIELDS = `id name email displayFinancialStatus displayFulfillmentStatus currencyCode tags note
  processedAt createdAt cancelledAt updatedAt sourceName discountCode paymentGatewayNames
  totalPriceSet { shopMoney { amount } } subtotalPriceSet { shopMoney { amount } }
  totalShippingPriceSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } }
  totalDiscountsSet { shopMoney { amount } }
  customer { id displayName }
  shippingAddress { name address1 address2 city zip province countryCodeV2 phone }
  fulfillments(first: 50) { id status displayStatus createdAt deliveredAt trackingInfo(first: 1) { company number url } }
  refunds(first: 50) { id createdAt note totalRefundedSet { shopMoney { amount currencyCode } } }
  transactions(first: 5) { kind status gateway paymentDetails { ... on CardPaymentDetails { number } } }`
const LINE_FIELDS =
  "id title variantTitle quantity sku originalUnitPriceSet { shopMoney { amount } } variant { id } product { id }"

export const PRODUCTS_QUERY = `{
  products { edges { node { ${PRODUCT_FIELDS} variants { edges { node { ${VARIANT_FIELDS} } } } } } }
}`

export const CUSTOMERS_QUERY = `{
  customers { edges { node { ${CUSTOMER_FIELDS} } } }
}`

/** Orders created on or after `since` (ISO date): the history `read_all_orders` allows, else Shopify's 60 days. */
export const ordersQuery = (since: string): string =>
  `{
  orders(query: "created_at:>=${since}") {
    edges { node { ${ORDER_FIELDS} lineItems { edges { node { ${LINE_FIELDS} } } } } }
  }
}`

/** The kinds a webhook or the reconcile sweep reads one by one, by their gid's type. */
export type MirrorKind = "Product" | "Customer" | "Order"

/** One object by its gid, as it is now, with its children (a webhook names it; this reads it). */
export const NODE_QUERY = `query($id: ID!) {
  node(id: $id) {
    ... on Product { ${PRODUCT_FIELDS} variants(first: 250) { edges { node { ${VARIANT_FIELDS} } } } }
    ... on Customer { ${CUSTOMER_FIELDS} }
    ... on Order { ${ORDER_FIELDS} lineItems(first: 250) { edges { node { ${LINE_FIELDS} } } } }
  }
}`

export const CHANGED_PAGE = 50

/** A page of what changed since a moment (the reconcile sweep), oldest change first. */
export const changedQuery = (kind: MirrorKind): string => {
  const field = kind === "Product" ? "products" : kind === "Customer" ? "customers" : "orders"
  const children = kind === "Product"
    ? `variants(first: 100) { edges { node { ${VARIANT_FIELDS} } } }`
    : kind === "Order"
    ? `lineItems(first: 100) { edges { node { ${LINE_FIELDS} } } }`
    : ""
  const fields = kind === "Product" ? PRODUCT_FIELDS : kind === "Customer" ? CUSTOMER_FIELDS : ORDER_FIELDS
  return `query($q: String!, $after: String) {
  ${field}(first: ${CHANGED_PAGE}, after: $after, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges { node { ${fields} ${children} } }
  }
}`
}

/** `gid://shopify/<type>/<id>` from a webhook's numeric id. */
export const gidOf = (type: MirrorKind, id: string | number) => `gid://shopify/${type}/${id}`

const isConnection = (value: unknown): value is { readonly edges: ReadonlyArray<{ readonly node: unknown }> } =>
  typeof value === "object" && value !== null && "edges" in value && Array.isArray((value as { edges: unknown }).edges)

/**
 * A node as a bulk file would hold it: the node without its connections, then each child with `__parentId`. So a
 * webhook's read and the reconcile sweep's pages go through the same `addLine` as the backfill.
 */
export const flatten = (node: unknown): Array<unknown> => {
  if (typeof node !== "object" || node === null) return []
  const parent: Record<string, unknown> = {}
  const children: Array<unknown> = []
  const id = (node as { id?: unknown }).id
  for (const [key, value] of Object.entries(node)) {
    if (!isConnection(value)) {
      parent[key] = value
      continue
    }
    for (const edge of value.edges) {
      const [child, ...grand] = flatten(edge.node)
      if (child !== undefined) children.push({ ...(child as object), __parentId: id }, ...grand)
    }
  }
  return [parent, ...children]
}

/* ─── Rows, keyed by Shopify ids; the upsert resolves Insyte's ids ──────── */

export interface ProductRow {
  readonly shopify_id: string
  readonly title: string
  readonly handle: string
  readonly description_html: string
  readonly status: "active" | "draft" | "archived"
  readonly vendor: string | null
  readonly product_type: string | null
  readonly tags: ReadonlyArray<string>
  readonly images: ReadonlyArray<string>
  readonly shopify_created_at: string | null
  readonly external_updated_at: string
  readonly raw: unknown
}

export interface VariantRow {
  readonly shopify_id: string
  readonly product_shopify_id: string
  readonly inventory_item_id: string | null
  readonly sku: string | null
  readonly title: string
  readonly price_minor: number
  readonly compare_at_minor: number | null
  readonly position: number
}

export interface CustomerRow {
  readonly shopify_id: string
  readonly email: string | null
  readonly name: string
  readonly phone: string | null
  readonly address: unknown
  readonly country: string | null
  readonly tags: ReadonlyArray<string>
  readonly orders_count: number
  readonly lifetime_value_minor: number
  readonly currency: string | null
  readonly marketing_consent: boolean
  readonly external_updated_at: string
  readonly raw: unknown
}

export type OrderStatus = "placed" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded"
export type PaymentStatus = "pending" | "paid" | "partially_refunded" | "refunded" | "voided"
export type FulfillmentStatus = "unfulfilled" | "partial" | "fulfilled" | "returned"

export interface OrderRow {
  readonly shopify_id: string
  readonly number: string
  readonly customer_shopify_id: string | null
  readonly customer_name: string
  readonly customer_email: string | null
  readonly status: OrderStatus
  readonly payment_status: PaymentStatus
  readonly fulfillment_status: FulfillmentStatus
  readonly total_minor: number
  readonly subtotal_minor: number
  readonly shipping_minor: number
  readonly tax_minor: number
  readonly discounts_minor: number
  readonly currency: string
  readonly payment_gateway: string | null
  readonly card_last4: string | null
  readonly shipping_address: unknown
  readonly tags: ReadonlyArray<string>
  readonly note: string | null
  readonly channel: string | null
  readonly referral_code: string | null
  readonly placed_at: string
  readonly paid_at: string | null
  readonly shipped_at: string | null
  readonly cancelled_at: string | null
  readonly refunded_at: string | null
  readonly external_updated_at: string
  readonly raw: unknown
}

export interface LineRow {
  readonly shopify_id: string
  readonly order_shopify_id: string
  readonly product_shopify_id: string | null
  readonly variant_shopify_id: string | null
  readonly sku: string | null
  readonly title: string
  readonly variant_title: string | null
  readonly quantity: number
  readonly unit_price_minor: number
}

export interface FulfilmentRow {
  readonly shopify_id: string
  readonly order_shopify_id: string
  readonly status: string
  readonly carrier: string | null
  readonly tracking_number: string | null
  readonly tracking_url: string | null
  readonly shipped_at: string | null
  readonly delivered_at: string | null
  readonly tracking_status: "in_transit" | "out_for_delivery" | "delivered" | "exception" | null
}

export interface RefundRow {
  readonly shopify_id: string
  readonly order_shopify_id: string
  readonly amount_minor: number
  readonly currency: string
  readonly note: string | null
  readonly created_at: string
}

/** One page of a bulk result, as rows per table. */
export interface MirrorBatch {
  readonly products: Array<ProductRow>
  readonly variants: Array<VariantRow>
  readonly customers: Array<CustomerRow>
  readonly orders: Array<OrderRow>
  readonly lines: Array<LineRow>
  readonly fulfilments: Array<FulfilmentRow>
  readonly refunds: Array<RefundRow>
  /** Lines of a type Insyte does not mirror, or that did not decode: counted, never written. */
  skipped: number
}

export const emptyBatch = (): MirrorBatch => ({
  products: [],
  variants: [],
  customers: [],
  orders: [],
  lines: [],
  fulfilments: [],
  refunds: [],
  skipped: 0
})

/* ─── Decoding a line ─────────────────────────────────────────────────────── */

const Str = Schema.NullOr(Schema.String)
const Money = Schema.Struct({ shopMoney: Schema.Struct({ amount: Schema.String }) })
const Address = Schema.NullOr(Schema.Struct({
  name: Schema.optional(Str),
  address1: Str,
  address2: Str,
  city: Str,
  zip: Str,
  province: Str,
  countryCodeV2: Str,
  phone: Schema.optional(Str)
}))

const ProductLine = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  handle: Schema.String,
  descriptionHtml: Schema.optional(Str),
  status: Schema.String,
  vendor: Str,
  productType: Str,
  tags: Schema.Array(Schema.String),
  createdAt: Str,
  updatedAt: Schema.String,
  featuredMedia: Schema.optional(Schema.NullOr(Schema.Struct({
    preview: Schema.NullOr(Schema.Struct({ image: Schema.NullOr(Schema.Struct({ url: Schema.String })) }))
  })))
})

const VariantLine = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  sku: Str,
  price: Schema.String,
  compareAtPrice: Str,
  position: Schema.Finite,
  inventoryItem: Schema.NullOr(Schema.Struct({ id: Schema.String })),
  __parentId: Schema.String
})

const CustomerLine = Schema.Struct({
  id: Schema.String,
  firstName: Str,
  lastName: Str,
  displayName: Schema.String,
  tags: Schema.Array(Schema.String),
  numberOfOrders: Schema.Union([Schema.String, Schema.Finite]),
  updatedAt: Schema.String,
  defaultEmailAddress: Schema.NullOr(Schema.Struct({ emailAddress: Str, marketingState: Str })),
  defaultPhoneNumber: Schema.NullOr(Schema.Struct({ phoneNumber: Str })),
  amountSpent: Schema.Struct({ amount: Schema.String, currencyCode: Schema.String }),
  defaultAddress: Address
})

const OrderLine = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Str,
  displayFinancialStatus: Str,
  displayFulfillmentStatus: Schema.String,
  currencyCode: Schema.String,
  tags: Schema.Array(Schema.String),
  note: Str,
  processedAt: Str,
  createdAt: Schema.String,
  cancelledAt: Str,
  updatedAt: Schema.String,
  sourceName: Str,
  discountCode: Str,
  paymentGatewayNames: Schema.Array(Schema.String),
  totalPriceSet: Money,
  subtotalPriceSet: Schema.NullOr(Money),
  totalShippingPriceSet: Money,
  totalTaxSet: Schema.NullOr(Money),
  totalDiscountsSet: Schema.NullOr(Money),
  customer: Schema.NullOr(Schema.Struct({ id: Schema.String, displayName: Schema.String })),
  shippingAddress: Address,
  fulfillments: Schema.Array(Schema.Struct({
    id: Schema.String,
    status: Schema.String,
    displayStatus: Str,
    createdAt: Schema.String,
    deliveredAt: Str,
    trackingInfo: Schema.Array(Schema.Struct({ company: Str, number: Str, url: Str }))
  })),
  refunds: Schema.Array(Schema.Struct({
    id: Schema.String,
    createdAt: Schema.String,
    note: Str,
    totalRefundedSet: Schema.Struct({
      shopMoney: Schema.Struct({ amount: Schema.String, currencyCode: Schema.String })
    })
  })),
  transactions: Schema.Array(Schema.Struct({
    kind: Schema.String,
    status: Schema.String,
    gateway: Str,
    paymentDetails: Schema.optional(Schema.NullOr(Schema.Struct({ number: Schema.optional(Str) })))
  }))
})

const LineItemLine = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  variantTitle: Str,
  quantity: Schema.Finite,
  sku: Str,
  originalUnitPriceSet: Money,
  variant: Schema.NullOr(Schema.Struct({ id: Schema.String })),
  product: Schema.NullOr(Schema.Struct({ id: Schema.String })),
  __parentId: Schema.String
})

const decode = <S extends Schema.Top>(schema: S) =>
  Schema.decodeUnknownOption(schema as never) as (u: unknown) => Option.Option<S["Type"]>
const product = decode(ProductLine)
const variant = decode(VariantLine)
const customer = decode(CustomerLine)
const order = decode(OrderLine)
const lineItem = decode(LineItemLine)

const PRODUCT_STATUS: Record<string, ProductRow["status"]> = {
  ACTIVE: "active",
  DRAFT: "draft",
  ARCHIVED: "archived",
  UNLISTED: "active"
}

const PAYMENT: Record<string, PaymentStatus> = {
  PAID: "paid",
  PARTIALLY_REFUNDED: "partially_refunded",
  REFUNDED: "refunded",
  VOIDED: "voided"
}

const FULFILMENT: Record<string, FulfillmentStatus> = {
  FULFILLED: "fulfilled",
  PARTIALLY_FULFILLED: "partial",
  RESTOCKED: "returned"
}

const TRACKING: Record<string, FulfilmentRow["tracking_status"]> = {
  IN_TRANSIT: "in_transit",
  CONFIRMED: "in_transit",
  LABEL_PRINTED: "in_transit",
  LABEL_PURCHASED: "in_transit",
  READY_FOR_PICKUP: "in_transit",
  OUT_FOR_DELIVERY: "out_for_delivery",
  ATTEMPTED_DELIVERY: "exception",
  FAILURE: "exception",
  DELIVERED: "delivered"
}

/**
 * Insyte's lifecycle from Shopify's statuses (domain.md §12.1): cancelled and refunded win, then delivered (every
 * parcel delivered), shipped (anything fulfilled), paid, else placed. `at_supplier` is Insyte's own (M8).
 */
export const orderStatus = (o: {
  readonly cancelled: boolean
  readonly payment: PaymentStatus
  readonly fulfilment: FulfillmentStatus
  readonly parcels: ReadonlyArray<{ readonly delivered: boolean }>
}): OrderStatus =>
  o.cancelled
    ? "cancelled"
    : o.payment === "refunded"
    ? "refunded"
    : o.parcels.length > 0 && o.parcels.every((p) => p.delivered) && o.fulfilment === "fulfilled"
    ? "delivered"
    : o.fulfilment === "fulfilled" || o.fulfilment === "partial"
    ? "shipped"
    : o.payment === "paid" || o.payment === "partially_refunded"
    ? "paid"
    : "placed"

const addressOf = (a: Schema.Schema.Type<typeof Address>) =>
  a === null
    ? null
    : {
      name: a.name ?? null,
      line1: a.address1,
      line2: a.address2,
      city: a.city,
      postcode: a.zip,
      region: a.province,
      country: a.countryCodeV2,
      phone: a.phone ?? null
    }

/** Adds one JSONL line (already parsed) to the batch: as its row, or as skipped. */
export const addLine = (batch: MirrorBatch, line: unknown, storeCurrency: string): void => {
  const id = typeof line === "object" && line !== null && "id" in line && typeof line.id === "string" ? line.id : ""
  switch (gidType(id)) {
    case "Product": {
      const p = Option.getOrUndefined(product(line))
      if (p === undefined) break
      batch.products.push({
        shopify_id: gidId(p.id),
        title: p.title,
        handle: p.handle,
        description_html: p.descriptionHtml ?? "",
        status: PRODUCT_STATUS[p.status] ?? "draft",
        vendor: p.vendor,
        product_type: p.productType === "" ? null : p.productType,
        tags: p.tags,
        images: p.featuredMedia?.preview?.image ? [p.featuredMedia.preview.image.url] : [],
        shopify_created_at: p.createdAt,
        external_updated_at: p.updatedAt,
        raw: line
      })
      return
    }
    case "ProductVariant": {
      const v = Option.getOrUndefined(variant(line))
      if (v === undefined) break
      batch.variants.push({
        shopify_id: gidId(v.id),
        product_shopify_id: gidId(v.__parentId),
        inventory_item_id: v.inventoryItem === null ? null : gidId(v.inventoryItem.id),
        sku: v.sku === "" ? null : v.sku,
        title: v.title,
        price_minor: toMinor(v.price, storeCurrency),
        compare_at_minor: v.compareAtPrice === null ? null : toMinor(v.compareAtPrice, storeCurrency),
        position: v.position
      })
      return
    }
    case "Customer": {
      const c = Option.getOrUndefined(customer(line))
      if (c === undefined) break
      const address = addressOf(c.defaultAddress)
      batch.customers.push({
        shopify_id: gidId(c.id),
        email: c.defaultEmailAddress?.emailAddress ?? null,
        name: c.displayName,
        phone: c.defaultPhoneNumber?.phoneNumber ?? null,
        address,
        country: address?.country ?? null,
        tags: c.tags,
        orders_count: Number(c.numberOfOrders),
        lifetime_value_minor: toMinor(c.amountSpent.amount, c.amountSpent.currencyCode),
        currency: c.amountSpent.currencyCode,
        marketing_consent: c.defaultEmailAddress?.marketingState === "SUBSCRIBED",
        external_updated_at: c.updatedAt,
        raw: line
      })
      return
    }
    case "Order": {
      const o = Option.getOrUndefined(order(line))
      if (o === undefined) break
      const currency = o.currencyCode
      const money = (m: { readonly shopMoney: { readonly amount: string } } | null) =>
        m === null ? 0 : toMinor(m.shopMoney.amount, currency)
      const payment = PAYMENT[o.displayFinancialStatus ?? ""] ?? "pending"
      const fulfilment = FULFILMENT[o.displayFulfillmentStatus] ?? "unfulfilled"
      const parcels = o.fulfillments.filter((f) => f.status !== "CANCELLED" && f.status !== "ERROR")
      const paidBy = o.transactions.find((t) => t.status === "SUCCESS" && (t.kind === "SALE" || t.kind === "CAPTURE"))
      const card = paidBy?.paymentDetails?.number ?? null
      const firstShipped = parcels.map((f) => f.createdAt).sort()[0] ?? null
      const lastRefund = o.refunds.map((r) => r.createdAt).sort().at(-1) ?? null
      batch.orders.push({
        shopify_id: gidId(o.id),
        number: o.name,
        customer_shopify_id: o.customer === null ? null : gidId(o.customer.id),
        customer_name: o.customer?.displayName ?? o.shippingAddress?.name ?? "",
        customer_email: o.email,
        status: orderStatus({
          cancelled: o.cancelledAt !== null,
          payment,
          fulfilment,
          parcels: parcels.map((f) => ({ delivered: f.displayStatus === "DELIVERED" || f.deliveredAt !== null }))
        }),
        payment_status: payment,
        fulfillment_status: fulfilment,
        total_minor: money(o.totalPriceSet),
        subtotal_minor: money(o.subtotalPriceSet),
        shipping_minor: money(o.totalShippingPriceSet),
        tax_minor: money(o.totalTaxSet),
        discounts_minor: money(o.totalDiscountsSet),
        currency,
        payment_gateway: paidBy?.gateway ?? o.paymentGatewayNames[0] ?? null,
        card_last4: card === null ? null : card.replace(/\D/g, "").slice(-4) || null,
        shipping_address: addressOf(o.shippingAddress),
        tags: o.tags,
        note: o.note === "" ? null : o.note,
        channel: o.sourceName,
        referral_code: o.discountCode,
        placed_at: o.processedAt ?? o.createdAt,
        paid_at: payment === "pending" || payment === "voided" ? null : o.processedAt ?? o.createdAt,
        shipped_at: firstShipped,
        cancelled_at: o.cancelledAt,
        refunded_at: payment === "refunded" ? lastRefund : null,
        external_updated_at: o.updatedAt,
        raw: line
      })
      for (const f of parcels) {
        const tracking = f.trackingInfo[0]
        batch.fulfilments.push({
          shopify_id: gidId(f.id),
          order_shopify_id: gidId(o.id),
          status: f.status.toLowerCase(),
          carrier: tracking?.company ?? null,
          tracking_number: tracking?.number ?? null,
          tracking_url: tracking?.url ?? null,
          shipped_at: f.createdAt,
          delivered_at: f.deliveredAt,
          tracking_status: TRACKING[f.displayStatus ?? ""] ?? null
        })
      }
      for (const r of o.refunds) {
        batch.refunds.push({
          shopify_id: gidId(r.id),
          order_shopify_id: gidId(o.id),
          amount_minor: toMinor(r.totalRefundedSet.shopMoney.amount, r.totalRefundedSet.shopMoney.currencyCode),
          currency: r.totalRefundedSet.shopMoney.currencyCode,
          note: r.note === "" ? null : r.note,
          created_at: r.createdAt
        })
      }
      return
    }
    case "LineItem": {
      const l = Option.getOrUndefined(lineItem(line))
      if (l === undefined) break
      batch.lines.push({
        shopify_id: gidId(l.id),
        order_shopify_id: gidId(l.__parentId),
        product_shopify_id: l.product === null ? null : gidId(l.product.id),
        variant_shopify_id: l.variant === null ? null : gidId(l.variant.id),
        sku: l.sku === "" ? null : l.sku,
        title: l.title,
        variant_title: l.variantTitle,
        quantity: l.quantity,
        unit_price_minor: toMinor(l.originalUnitPriceSet.shopMoney.amount, storeCurrency)
      })
      return
    }
  }
  batch.skipped++
}

/** Splits a JSONL text into parsed lines, skipping blanks and lines that are not JSON. */
export const parseJsonl = (text: string): Array<unknown> =>
  text.split("\n").flatMap((raw) => {
    const line = raw.trim()
    if (line === "") return []
    try {
      return [JSON.parse(line) as unknown]
    } catch {
      return [{ id: "" }]
    }
  })
