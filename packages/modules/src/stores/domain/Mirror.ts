import { minorDigits } from "@insyte/domain/MinorUnits"
import { Option, Schema } from "effect"

/*
 * The commerce mirror's shapes (M6.3; integrations.md §2 "Backfill", domain.md §4): the queries Insyte reads a store
 * with, and one line of their answer turned into the row it becomes. An answer is flattened into lines (`flatten`), as
 * a bulk file held them: a variant or an order's line item is its own line, after its parent, carrying `__parentId`.
 * So a line is classified by its gid's type and keeps its parent's Shopify id; the upsert finds the parent's row by
 * that id (the parent was written first, in this page or an earlier one). Lists that are not connections (fulfilments, refunds) come inline with the
 * order. Amounts arrive as decimal strings and are kept in minor units of the currency.
 */

/** `gid://shopify/Order/123` → `123`, the number webhooks send too. */
export const gidId = (gid: string): string => gid.slice(gid.lastIndexOf("/") + 1)

/**
 * The affiliate link an order came through (M16 step 4): the cart attribute `insyte_ref` the storefront kept from the
 * redirect's `?insyte_ref=`. Only a slug's shape is kept; anything else is no link.
 */
const refOf = (attributes: ReadonlyArray<{ readonly key: string; readonly value: string | null }> | undefined) => {
  const value = attributes?.find((a) => a.key === "insyte_ref" || a.key === "_insyte_ref")?.value?.trim().toLowerCase()
  return value !== undefined && /^[a-z0-9]{8,16}$/.test(value) ? value : null
}

/** `gid://shopify/ProductVariant/1` → `ProductVariant`. */
export const gidType = (gid: string): string => gid.split("/")[3] ?? ""

/** `"12.34"` in EUR → `1234`; exact on the decimal string, never through a float multiply. */
export const toMinor = (amount: string | number, currency: string): number => {
  const digits = minorDigits(currency)
  const [whole = "0", fraction = ""] = String(amount).trim().replace(/^-/, "").split(".")
  const sign = String(amount).trim().startsWith("-") ? -1 : 1
  const padded = (fraction + "0".repeat(digits)).slice(0, digits)
  return sign * Number(`${whole}${padded}`)
}

/** `1234` in EUR → `"12.34"`: the decimal string Shopify takes, never through a float divide. */
export const fromMinor = (minor: number, currency: string): string => {
  const digits = minorDigits(currency)
  const text = String(Math.abs(minor)).padStart(digits + 1, "0")
  const whole = digits === 0 ? text : `${text.slice(0, -digits)}.${text.slice(-digits)}`
  return minor < 0 ? `-${whole}` : whole
}

/* ─── The queries (API 2026-10): one selection per object, for the import's pages and single reads ─── */

const PRODUCT_FIELDS = `id title handle descriptionHtml status vendor productType tags isGiftCard createdAt updatedAt
  featuredMedia { preview { image { url } } }`
const VARIANT_FIELDS = "id title sku price compareAtPrice position inventoryItem { id tracked }"
/**
 * Stock per location, read by the import's own pass after the products (a webhook reports one location at a time).
 * Each level is its own line after its inventory item; it names that item, so its variant is found by it and not by
 * `__parentId`. "available" is what can be sold (Shopify's own `available` field is deprecated).
 */
const LEVEL_FIELDS = `id updatedAt item { id } location { id } quantities(names: ["available"]) { name quantity }`
/** A product's photographs, in its own order; other media (video, 3D) are not mirrored. */
const MEDIA_FIELDS = "... on MediaImage { id image { url } }"
const CUSTOMER_FIELDS = `id firstName lastName displayName tags numberOfOrders createdAt updatedAt
  defaultEmailAddress { emailAddress marketingState }
  defaultPhoneNumber { phoneNumber }
  amountSpent { amount currencyCode }
  defaultAddress { address1 address2 city zip province countryCodeV2 }`
const ORDER_FIELDS = `id name email displayFinancialStatus displayFulfillmentStatus currencyCode tags note
  processedAt createdAt cancelledAt updatedAt sourceName discountCode paymentGatewayNames customAttributes { key value }
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

/* ─── The pages and single reads (M6.3): plain Admin GraphQL reads, a cursor at a time ─── */

/**
 * What the import reads, in its order: the products first, so lines find their variants; then the stock, so each
 * count finds its variant; customers before orders, so an order finds its customer. Not Shopify's bulk operations: an
 * app's access to those now needs an IP allowlist, and a Worker has no fixed address.
 */
export type BackfillResource = "products" | "stock" | "customers" | "orders"

/** The kinds a webhook or the reconcile sweep reads one by one, by their gid's type. */
export type MirrorKind = "Product" | "Customer" | "Order"

interface ChildRead {
  /** The connection on the node, and its node's selection. */
  readonly field: string
  readonly selection: string
  /** Children read with their node; a node with more has the rest read after it (`childQuery`). */
  readonly first: number
}

interface PageRead {
  /** The root connection, its node's type, and its arguments besides `first` and `after`. */
  readonly root: string
  readonly type: string
  readonly args: string
  readonly fields: string
  readonly first: number
  readonly children: ReadonlyArray<ChildRead>
}

/**
 * Page sizes that keep each query's requested cost under Shopify's 1000 points a query, which it checks before running
 * one (MAX_COST_EXCEEDED). Counted as Shopify documents it (an object 1, a connection 2 plus `first` times its node),
 * the dearest query here asks for under 900, and Shopify prices large connections lower than that
 * (`QueryCost.ts`, `stores-query-cost.test.ts`). An order is the dearest node: its fulfilments and refunds (50 each)
 * are lists, read with it. The same selections serve the import's pages, the reconcile sweep's and a webhook's single
 * read, so an object is written alike whichever read it.
 */
const READS: Record<BackfillResource, PageRead> = {
  products: {
    root: "products",
    type: "Product",
    args: ", sortKey: ID",
    fields: PRODUCT_FIELDS,
    first: 10,
    children: [
      { field: "variants", selection: VARIANT_FIELDS, first: 20 },
      { field: "media", selection: MEDIA_FIELDS, first: 10 }
    ]
  },
  stock: {
    root: "inventoryItems",
    type: "InventoryItem",
    args: "",
    fields: "id",
    first: 25,
    children: [{ field: "inventoryLevels", selection: LEVEL_FIELDS, first: 5 }]
  },
  customers: {
    root: "customers",
    type: "Customer",
    args: ", sortKey: ID",
    fields: CUSTOMER_FIELDS,
    first: 100,
    children: []
  },
  orders: {
    root: "orders",
    type: "Order",
    args: ", sortKey: ID, query: $q",
    fields: ORDER_FIELDS,
    first: 2,
    children: [{ field: "lineItems", selection: LINE_FIELDS, first: 10 }]
  }
}

/** Each kind's read, the import's for its resource. */
const KINDS: Record<MirrorKind, PageRead> = { Product: READS.products, Customer: READS.customers, Order: READS.orders }

/** A node's children past their first page, read a hundred at a time. */
export const FOLLOW_UP_PAGE = 100

/** Smaller pages than these (the worker tests read one or two objects a page); `0` keeps the size above. */
export interface PageSizes {
  readonly page: number
  readonly child: number
}

const connection = (field: string, first: number, selection: string, after = "") =>
  `${field}(first: ${first}${after}) { pageInfo { hasNextPage endCursor } edges { node { ${selection} } } }`

/** A node's own fields and the first page of each of its children. */
const nodeSelection = (read: PageRead, child = 0) =>
  [read.fields, ...read.children.map((c) => connection(c.field, child || c.first, c.selection))].join(" ")

/** The root connection a resource's page answers under (`products`, `inventoryItems`, …). */
export const backfillRoot = (resource: BackfillResource): string => READS[resource].root

/** One page of a resource from `$after`, by id: each node with the first page of its children. */
export const backfillQuery = (resource: BackfillResource, sizes: PageSizes = { page: 0, child: 0 }): string => {
  const read = READS[resource]
  return `query($after: String${resource === "orders" ? ", $q: String!" : ""}) {
  ${read.root}(first: ${sizes.page || read.first}, after: $after${read.args}) {
    pageInfo { hasNextPage endCursor }
    edges { node { ${nodeSelection(read, sizes.child)} } }
  }
}`
}

/**
 * What a page is asked with: where it starts, and for the orders how far back (ISO date: the history
 * `read_all_orders` allows, else Shopify's 60 days).
 */
export const backfillVariables = (resource: BackfillResource, since: string, after: string | null) =>
  resource === "orders" ? { after, q: `created_at:>=${since}` } : { after }

const readOf = (type: string): PageRead | undefined => Object.values(READS).find((r) => r.type === type)

/** The child connections a node of `type` (its gid's) carries, each read a page at a time. */
export const childFields = (type: string): ReadonlyArray<string> => readOf(type)?.children.map((c) => c.field) ?? []

/** The next page of one node's children: `$id` is the node, `$after` where its last page of them ended. */
export const childQuery = (type: string, field: string, first = FOLLOW_UP_PAGE): string => {
  const child = readOf(type)?.children.find((c) => c.field === field)
  if (child === undefined) throw new Error(`${type} has no child connection ${field}`)
  return `query($id: ID!, $after: String) {
  node(id: $id) { ... on ${type} { ${connection(field, first, child.selection, ", after: $after")} } }
}`
}

/**
 * One object by its gid, as it is now, with the first page of each of its children (a webhook names it; this reads
 * it). A node with more children has the rest read after it (`childQuery`), so it is written whole.
 */
export const NODE_QUERY = `query($id: ID!) {
  node(id: $id) {
${Object.entries(KINDS).map(([kind, read]) => `    ... on ${kind} { ${nodeSelection(read)} }`).join("\n")}
  }
}`

/** How many objects a page of the reconcile sweep holds: as many as one of the import's. */
export const changedPage = (kind: MirrorKind): number => KINDS[kind].first

/** A page of what changed since a moment (the reconcile sweep), oldest change first. */
export const changedQuery = (kind: MirrorKind): string => {
  const read = KINDS[kind]
  return `query($q: String!, $after: String) {
  ${read.root}(first: ${read.first}, after: $after, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges { node { ${nodeSelection(read)} } }
  }
}`
}

/** `gid://shopify/<type>/<id>` from a webhook's numeric id. */
export const gidOf = (type: MirrorKind, id: string | number) => `gid://shopify/${type}/${id}`

const isConnection = (value: unknown): value is { readonly edges: ReadonlyArray<{ readonly node: unknown }> } =>
  typeof value === "object" && value !== null && "edges" in value && Array.isArray((value as { edges: unknown }).edges)

/**
 * A node as lines: the node without its connections, then each child with `__parentId`. So a webhook's read, the
 * reconcile sweep's pages and the import's pages all go through the same `addLine`.
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
  /** Shopify's gift card: sold, never stocked, so no stock rule looks at it (its variants are untracked). */
  readonly is_gift_card: boolean
  readonly shopify_created_at: string | null
  readonly external_updated_at: string
  readonly raw: unknown
}

export interface VariantRow {
  readonly shopify_id: string
  readonly product_shopify_id: string
  readonly inventory_item_id: string | null
  /** Whether Shopify counts its stock; `null` where the read did not say. */
  readonly tracked: boolean | null
  readonly sku: string | null
  readonly title: string
  readonly price_minor: number
  readonly compare_at_minor: number | null
  readonly position: number
}

/**
 * One location's count of one inventory item (a variant), as Shopify reports it: `reported_at` is when it last changed
 * there, so a later report (a webhook) is not undone by an import that read it earlier.
 */
export interface LevelRow {
  readonly inventory_item_id: string
  readonly location_id: string
  readonly available: number
  readonly reported_at: string
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
  /** The cart's `insyte_ref` (an affiliate link's, M16 step 4). */
  readonly affiliate_ref: string | null
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

/** One page of lines, as rows per table. */
export interface MirrorBatch {
  readonly products: Array<ProductRow>
  readonly variants: Array<VariantRow>
  readonly customers: Array<CustomerRow>
  readonly orders: Array<OrderRow>
  readonly lines: Array<LineRow>
  readonly fulfilments: Array<FulfilmentRow>
  readonly refunds: Array<RefundRow>
  /** Stock per variant and location (the import's stock pass; webhooks report one location at a time). */
  readonly levels: Array<LevelRow>
  /** A product's photographs beyond its featured one, in order: folded into its `images`. */
  readonly images: Array<{ readonly product_shopify_id: string; readonly url: string }>
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
  levels: [],
  images: [],
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
  isGiftCard: Schema.optional(Schema.Boolean),
  createdAt: Str,
  updatedAt: Schema.String,
  featuredMedia: Schema.optional(Schema.NullOr(Schema.Struct({
    preview: Schema.NullOr(Schema.Struct({ image: Schema.NullOr(Schema.Struct({ url: Schema.String })) }))
  })))
})

const MediaImageLine = Schema.Struct({
  id: Schema.String,
  image: Schema.NullOr(Schema.Struct({ url: Schema.String })),
  __parentId: Schema.String
})

const VariantLine = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  sku: Str,
  price: Schema.String,
  compareAtPrice: Str,
  position: Schema.Finite,
  inventoryItem: Schema.NullOr(Schema.Struct({ id: Schema.String, tracked: Schema.optional(Schema.Boolean) })),
  __parentId: Schema.String
})

const InventoryLevelLine = Schema.Struct({
  id: Schema.String,
  updatedAt: Schema.String,
  item: Schema.Struct({ id: Schema.String }),
  location: Schema.Struct({ id: Schema.String }),
  quantities: Schema.Array(Schema.Struct({ name: Schema.String, quantity: Schema.Finite }))
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
  customAttributes: Schema.optional(Schema.Array(Schema.Struct({ key: Schema.String, value: Str }))),
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
const mediaImage = decode(MediaImageLine)
const inventoryLevel = decode(InventoryLevelLine)
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

/** Adds one line (a flattened node, or a parsed JSONL line) to the batch: as its row, or as skipped. */
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
        is_gift_card: p.isGiftCard ?? false,
        shopify_created_at: p.createdAt,
        external_updated_at: p.updatedAt,
        raw: line
      })
      return
    }
    case "MediaImage": {
      const m = Option.getOrUndefined(mediaImage(line))
      if (m === undefined || m.image === null) break
      batch.images.push({ product_shopify_id: gidId(m.__parentId), url: m.image.url })
      return
    }
    case "ProductVariant": {
      const v = Option.getOrUndefined(variant(line))
      if (v === undefined) break
      batch.variants.push({
        shopify_id: gidId(v.id),
        product_shopify_id: gidId(v.__parentId),
        inventory_item_id: v.inventoryItem === null ? null : gidId(v.inventoryItem.id),
        tracked: v.inventoryItem?.tracked ?? null,
        sku: v.sku === "" ? null : v.sku,
        title: v.title,
        price_minor: toMinor(v.price, storeCurrency),
        compare_at_minor: v.compareAtPrice === null ? null : toMinor(v.compareAtPrice, storeCurrency),
        position: v.position
      })
      return
    }
    case "InventoryLevel": {
      const l = Option.getOrUndefined(inventoryLevel(line))
      const available = l?.quantities.find((q) => q.name === "available")
      if (l === undefined || available === undefined) break
      batch.levels.push({
        inventory_item_id: gidId(l.item.id),
        location_id: gidId(l.location.id),
        available: Math.trunc(available.quantity),
        reported_at: l.updatedAt
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
        affiliate_ref: refOf(o.customAttributes),
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
