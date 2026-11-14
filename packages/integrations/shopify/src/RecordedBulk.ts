/*
 * A development store's bulk results, as Shopify writes them (JSONL, children after their parent with `__parentId`):
 * three products with four variants, three customers, and five orders across the lifecycle (paid and open, shipped,
 * delivered, refunded, cancelled), one of them without a customer. Two products have photographs (a featured one,
 * then the rest as `MediaImage` children); the third has none. Each variant has stock, at one location or two, each
 * count an `InventoryLevel` line after its variant; none is low, so a store's import alone raises no stock-out. The
 * bag is made to order: Shopify does not track it, so its count of nothing is no stock-out either. The worker tests
 * read them in pages small enough that a line item lands in a later page than its order, and a variant's second count
 * in a later page than its first.
 */

const gid = (type: string, id: number) => `gid://shopify/${type}/${id}`
const money = (amount: string) => ({ shopMoney: { amount } })

/** A photograph on Unsplash, as the design reference's catalogue uses them; Shopify's would be on its CDN. */
const photo = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&q=80&auto=format&fit=crop`

/** A product; its vendor is the shop's own name, Shopify's default, unless a supplier makes it. */
const product = (
  id: number,
  title: string,
  updatedAt: string,
  featured: string | null = null,
  vendor = "Insyte MVP Test"
) => ({
  id: gid("Product", id),
  title,
  handle: title.toLowerCase().replaceAll(" ", "-"),
  descriptionHtml: `<p>${title}</p>`,
  status: "ACTIVE",
  vendor,
  productType: "Kleding",
  tags: [],
  createdAt: "2026-01-10T09:00:00Z",
  updatedAt,
  featuredMedia: featured === null ? null : { preview: { image: { url: featured } } }
})

const media = (id: number, productId: number, url: string) => ({
  id: gid("MediaImage", id),
  image: { url },
  __parentId: gid("Product", productId)
})

const LINEN = ["1713881587420-113c1c43e28a", "1713881676551-b16f22ce4719", "1713881604560-085594ed2c3d"].map(photo)
const WOOL = ["1620799140408-edc6dcb6d633", "1607160199580-1b0c9b736b66"].map(photo)

const variant = (
  id: number,
  productId: number,
  title: string,
  sku: string,
  price: string,
  position: number,
  tracked = true
) => ({
  id: gid("ProductVariant", id),
  title,
  sku,
  price,
  compareAtPrice: null,
  position,
  inventoryItem: { id: gid("InventoryItem", id), tracked },
  __parentId: gid("Product", productId)
})

/** One location's count of a variant's inventory item, last changed before the import. */
const level = (variantId: number, location: number, available: number) => ({
  id: `gid://shopify/InventoryLevel/${variantId}${location}?inventory_item_id=${variantId}`,
  updatedAt: "2026-09-15T08:00:00Z",
  item: { id: gid("InventoryItem", variantId) },
  location: { id: gid("Location", location) },
  quantities: [{ name: "available", quantity: available }],
  __parentId: gid("ProductVariant", variantId)
})

const customer = (
  id: number,
  first: string,
  last: string,
  email: string,
  orders: number,
  spent: string,
  marketing = "NOT_SUBSCRIBED"
) => ({
  id: gid("Customer", id),
  firstName: first,
  lastName: last,
  displayName: `${first} ${last}`,
  tags: [],
  numberOfOrders: String(orders),
  createdAt: "2026-02-01T09:00:00Z",
  updatedAt: "2026-10-01T09:00:00Z",
  defaultEmailAddress: { emailAddress: email, marketingState: marketing },
  defaultPhoneNumber: null,
  amountSpent: { amount: spent, currencyCode: "EUR" },
  defaultAddress: {
    address1: "Keizersgracht 1",
    address2: null,
    city: "Amsterdam",
    zip: "1015 CJ",
    province: null,
    countryCodeV2: "NL"
  }
})

const order = (id: number, o: {
  customer: number | null
  financial: string
  fulfilment: string
  total: string
  cancelled?: string
  fulfillments?: ReadonlyArray<unknown>
  refunds?: ReadonlyArray<unknown>
}) => ({
  id: gid("Order", id),
  name: `#${1000 + id}`,
  email: o.customer === null ? null : `klant${o.customer}@example.com`,
  displayFinancialStatus: o.financial,
  displayFulfillmentStatus: o.fulfilment,
  currencyCode: "EUR",
  tags: [],
  note: null,
  processedAt: `2026-10-0${id}T10:00:00Z`,
  createdAt: `2026-10-0${id}T10:00:00Z`,
  cancelledAt: o.cancelled ?? null,
  updatedAt: `2026-10-0${id}T12:00:00Z`,
  sourceName: "web",
  discountCode: null,
  paymentGatewayNames: ["shopify_payments"],
  totalPriceSet: money(o.total),
  subtotalPriceSet: money(o.total),
  totalShippingPriceSet: money("0.00"),
  totalTaxSet: money("0.00"),
  totalDiscountsSet: money("0.00"),
  customer: o.customer === null ? null : { id: gid("Customer", o.customer), displayName: `Klant ${o.customer}` },
  shippingAddress: null,
  fulfillments: o.fulfillments ?? [],
  refunds: o.refunds ?? [],
  transactions: [{ kind: "SALE", status: "SUCCESS", gateway: "shopify_payments", paymentDetails: null }]
})

const line = (id: number, orderId: number, variantId: number, productId: number, title: string, price: string) => ({
  id: gid("LineItem", id),
  title,
  variantTitle: null,
  quantity: 1,
  sku: null,
  originalUnitPriceSet: money(price),
  variant: { id: gid("ProductVariant", variantId) },
  product: { id: gid("Product", productId) },
  __parentId: gid("Order", orderId)
})

const parcel = (id: number, delivered: boolean) => ({
  id: gid("Fulfillment", id),
  status: "SUCCESS",
  displayStatus: delivered ? "DELIVERED" : "IN_TRANSIT",
  createdAt: "2026-10-05T09:00:00Z",
  deliveredAt: delivered ? "2026-10-07T09:00:00Z" : null,
  trackingInfo: [{ company: "PostNL", number: `3S${id}`, url: null }]
})

const jsonl = (lines: ReadonlyArray<unknown>) => lines.map((l) => JSON.stringify(l)).join("\n") + "\n"

export const RECORDED_BULK = {
  products: jsonl([
    product(1, "Linnen overhemd", "2026-09-01T00:00:00Z", LINEN[0]!, "Atelier Noord"),
    media(101, 1, LINEN[0]!),
    // The L's two counts land in two pages (four lines each): nothing at the shop's own location, 38 at the second.
    variant(12, 1, "L", "LIN-L", "49.95", 2),
    level(12, 900, 0),
    level(12, 901, 38),
    variant(11, 1, "M", "LIN-M", "49.95", 1),
    level(11, 900, 24),
    ...LINEN.slice(1).map((url, i) => media(102 + i, 1, url)),
    product(2, "Wollen trui", "2026-09-02T00:00:00Z", WOOL[0]!, "Wolhuis"),
    variant(21, 2, "Default Title", "WOL-1", "89.00", 1),
    level(21, 900, 40),
    ...WOOL.map((url, i) => media(201 + i, 2, url)),
    product(3, "Canvas tas", "2026-09-03T00:00:00Z"),
    // Made to order: Shopify does not count it, and its count stays at nothing.
    variant(31, 3, "Default Title", "TAS-1", "24.50", 1, false),
    level(31, 900, 0)
  ]),
  customers: jsonl([
    // Anna said yes to marketing at the checkout; the others did not (M7.5's consent).
    customer(1, "Anna", "de Vries", "klant1@example.com", 2, "138.95", "SUBSCRIBED"),
    customer(2, "Bram", "Jansen", "klant2@example.com", 2, "74.45"),
    customer(3, "Chen", "Li", "klant3@example.com", 0, "0.00")
  ]),
  orders: jsonl([
    order(1, { customer: 1, financial: "PAID", fulfilment: "UNFULFILLED", total: "49.95" }),
    line(101, 1, 11, 1, "Linnen overhemd", "49.95"),
    order(2, {
      customer: 1,
      financial: "PAID",
      fulfilment: "FULFILLED",
      total: "89.00",
      fulfillments: [parcel(201, true)]
    }),
    line(102, 2, 21, 2, "Wollen trui", "89.00"),
    order(3, {
      customer: 2,
      financial: "PAID",
      fulfilment: "FULFILLED",
      total: "49.95",
      fulfillments: [parcel(301, false)]
    }),
    line(103, 3, 12, 1, "Linnen overhemd", "49.95"),
    order(4, {
      customer: 2,
      financial: "REFUNDED",
      fulfilment: "UNFULFILLED",
      total: "24.50",
      refunds: [{
        id: gid("Refund", 401),
        createdAt: "2026-10-04T15:00:00Z",
        note: "Te laat",
        totalRefundedSet: { shopMoney: { amount: "24.50", currencyCode: "EUR" } }
      }]
    }),
    line(104, 4, 31, 3, "Canvas tas", "24.50"),
    order(5, {
      customer: null,
      financial: "VOIDED",
      fulfilment: "UNFULFILLED",
      total: "24.50",
      cancelled: "2026-10-05T11:00:00Z"
    }),
    line(105, 5, 31, 3, "Canvas tas", "24.50"),
    line(106, 5, 11, 1, "Linnen overhemd", "49.95")
  ])
} as const

/** What the recorded store holds, as Shopify would count it. */
export const RECORDED_COUNTS = { products: 3, variants: 4, customers: 3, orders: 5, lines: 6 } as const

/** Each tracked variant's units over its locations after the import (inventory item id → available). */
export const RECORDED_STOCK = { 11: 24, 12: 38, 21: 40 } as const

/**
 * What Shopify holds now for an `upd-*` shop, where it differs from the import: order #1001 was shipped since (newer),
 * and a stale read of order #1002 (older than the import) that must not roll it back.
 */
export const RECORDED_UPDATES: Readonly<Record<string, Record<string, unknown>>> = {
  "gid://shopify/Order/1": {
    displayFulfillmentStatus: "FULFILLED",
    updatedAt: "2026-10-01T13:00:00Z",
    fulfillments: [parcel(111, false)]
  },
  "gid://shopify/Order/2": { displayFinancialStatus: "PENDING", updatedAt: "2026-10-02T11:00:00Z" }
}
