/*
 * A development store's bulk results, as Shopify writes them (JSONL, children after their parent with `__parentId`):
 * three products with four variants, three customers, and five orders across the lifecycle (paid and open, shipped,
 * delivered, refunded, cancelled), one of them without a customer. The worker tests read them in pages small enough
 * that a line item lands in a later page than its order.
 */

const gid = (type: string, id: number) => `gid://shopify/${type}/${id}`
const money = (amount: string) => ({ shopMoney: { amount } })

const product = (id: number, title: string, updatedAt: string) => ({
  id: gid("Product", id),
  title,
  handle: title.toLowerCase().replaceAll(" ", "-"),
  descriptionHtml: `<p>${title}</p>`,
  status: "ACTIVE",
  vendor: "Insyte MVP Test",
  productType: "Kleding",
  tags: [],
  createdAt: "2026-01-10T09:00:00Z",
  updatedAt,
  featuredMedia: null
})

const variant = (id: number, productId: number, title: string, sku: string, price: string, position: number) => ({
  id: gid("ProductVariant", id),
  title,
  sku,
  price,
  compareAtPrice: null,
  position,
  inventoryItem: { id: gid("InventoryItem", id) },
  __parentId: gid("Product", productId)
})

const customer = (id: number, first: string, last: string, email: string, orders: number, spent: string) => ({
  id: gid("Customer", id),
  firstName: first,
  lastName: last,
  displayName: `${first} ${last}`,
  tags: [],
  numberOfOrders: String(orders),
  createdAt: "2026-02-01T09:00:00Z",
  updatedAt: "2026-10-01T09:00:00Z",
  defaultEmailAddress: { emailAddress: email, marketingState: "NOT_SUBSCRIBED" },
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
    product(1, "Linnen overhemd", "2026-09-01T00:00:00Z"),
    variant(11, 1, "M", "LIN-M", "49.95", 1),
    variant(12, 1, "L", "LIN-L", "49.95", 2),
    product(2, "Wollen trui", "2026-09-02T00:00:00Z"),
    variant(21, 2, "Default Title", "WOL-1", "89.00", 1),
    product(3, "Canvas tas", "2026-09-03T00:00:00Z"),
    variant(31, 3, "Default Title", "TAS-1", "24.50", 1)
  ]),
  customers: jsonl([
    customer(1, "Anna", "de Vries", "klant1@example.com", 2, "138.95"),
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
