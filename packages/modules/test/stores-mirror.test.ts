import { describe, expect, it } from "vitest"
import {
  addLine,
  emptyBatch,
  gidId,
  gidType,
  orderStatus,
  parseJsonl,
  PRODUCTS_QUERY,
  toMinor
} from "../src/stores/domain/Mirror.ts"

/*
 * The mirror's pure half (M6.3): a bulk result's lines become rows, children keep their parent's Shopify id, amounts
 * are exact in minor units, and Shopify's statuses become Insyte's lifecycle.
 */

const money = (amount: string) => ({ shopMoney: { amount } })

const order = (id: number, overrides: Record<string, unknown> = {}) => ({
  id: `gid://shopify/Order/${id}`,
  name: `#${1000 + id}`,
  email: "anna@example.com",
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  currencyCode: "EUR",
  tags: ["vip"],
  note: "",
  processedAt: "2026-10-01T10:00:00Z",
  createdAt: "2026-10-01T10:00:00Z",
  cancelledAt: null,
  updatedAt: "2026-10-02T10:00:00Z",
  sourceName: "web",
  discountCode: null,
  paymentGatewayNames: ["shopify_payments"],
  totalPriceSet: money("59.90"),
  subtotalPriceSet: money("54.95"),
  totalShippingPriceSet: money("4.95"),
  totalTaxSet: money("10.40"),
  totalDiscountsSet: money("0.0"),
  customer: { id: "gid://shopify/Customer/7", displayName: "Anna de Vries" },
  shippingAddress: {
    name: "Anna de Vries",
    address1: "Keizersgracht 1",
    address2: null,
    city: "Amsterdam",
    zip: "1015 CJ",
    province: null,
    countryCodeV2: "NL",
    phone: null
  },
  fulfillments: [],
  refunds: [],
  transactions: [{
    kind: "SALE",
    status: "SUCCESS",
    gateway: "shopify_payments",
    paymentDetails: { number: "•••• •••• •••• 4242" }
  }],
  ...overrides
})

const JSONL = [
  {
    id: "gid://shopify/Product/1",
    title: "Linnen overhemd",
    handle: "linnen-overhemd",
    descriptionHtml: "<p>Licht</p>",
    status: "ACTIVE",
    vendor: "Insyte",
    productType: "",
    tags: ["zomer"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    featuredMedia: { preview: { image: { url: "https://cdn.shopify.com/a.jpg" } } }
  },
  {
    id: "gid://shopify/ProductVariant/11",
    title: "M",
    sku: "LIN-M",
    price: "49.95",
    compareAtPrice: null,
    position: 1,
    inventoryItem: { id: "gid://shopify/InventoryItem/111" },
    __parentId: "gid://shopify/Product/1"
  },
  order(5),
  {
    id: "gid://shopify/LineItem/51",
    title: "Linnen overhemd",
    variantTitle: "M",
    quantity: 1,
    sku: "LIN-M",
    originalUnitPriceSet: money("49.95"),
    variant: { id: "gid://shopify/ProductVariant/11" },
    product: { id: "gid://shopify/Product/1" },
    __parentId: "gid://shopify/Order/5"
  },
  { id: "gid://shopify/Collection/9", title: "Not mirrored" }
].map((line) => JSON.stringify(line)).join("\n")

/** One location's count of inventory item 111, as a bulk file holds it. */
const level = (location: number, quantities: ReadonlyArray<unknown>) => ({
  id: `gid://shopify/InventoryLevel/7${location}?inventory_item_id=111`,
  updatedAt: "2026-09-15T08:00:00Z",
  item: { id: "gid://shopify/InventoryItem/111" },
  location: { id: `gid://shopify/Location/${location}` },
  quantities,
  __parentId: "gid://shopify/ProductVariant/11"
})

describe("the commerce mirror's lines", () => {
  it("reads gids and keeps money exact in minor units", () => {
    expect(gidId("gid://shopify/Order/5")).toBe("5")
    expect(gidType("gid://shopify/ProductVariant/11")).toBe("ProductVariant")
    expect(toMinor("49.95", "EUR")).toBe(4995)
    expect(toMinor("0.1", "EUR")).toBe(10)
    expect(toMinor("19.99", "eur")).toBe(1999)
    expect(toMinor("1200.0", "JPY")).toBe(1200)
    expect(toMinor("-5.5", "USD")).toBe(-550)
    // A float would say 1004.9999…; the decimal string never goes through one.
    expect(toMinor("10.05", "EUR")).toBe(1005)
  })

  it("turns a bulk result into rows, children pointing at their parent's Shopify id", () => {
    const batch = emptyBatch()
    for (const line of parseJsonl(`${JSONL}\n\nnot json\n`)) addLine(batch, line, "EUR")
    expect(batch.products).toMatchObject([{
      shopify_id: "1",
      status: "active",
      product_type: null,
      images: ["https://cdn.shopify.com/a.jpg"],
      external_updated_at: "2026-09-01T00:00:00Z"
    }])
    expect(batch.variants).toEqual([{
      shopify_id: "11",
      product_shopify_id: "1",
      inventory_item_id: "111",
      sku: "LIN-M",
      title: "M",
      price_minor: 4995,
      compare_at_minor: null,
      position: 1
    }])
    expect(batch.orders).toMatchObject([{
      shopify_id: "5",
      number: "#1005",
      customer_shopify_id: "7",
      customer_name: "Anna de Vries",
      status: "paid",
      payment_status: "paid",
      fulfillment_status: "unfulfilled",
      total_minor: 5990,
      shipping_minor: 495,
      discounts_minor: 0,
      payment_gateway: "shopify_payments",
      card_last4: "4242",
      note: null,
      shipping_address: { line1: "Keizersgracht 1", city: "Amsterdam", postcode: "1015 CJ", country: "NL" }
    }])
    expect(batch.lines).toMatchObject([{ shopify_id: "51", order_shopify_id: "5", variant_shopify_id: "11" }])
    // The collection and the line that was not JSON.
    expect(batch.skipped).toBe(2)
  })

  it("keeps an order's parcels and refunds, and says where the order is", () => {
    const batch = emptyBatch()
    addLine(
      batch,
      order(6, {
        displayFinancialStatus: "PARTIALLY_REFUNDED",
        displayFulfillmentStatus: "FULFILLED",
        fulfillments: [
          {
            id: "gid://shopify/Fulfillment/61",
            status: "SUCCESS",
            displayStatus: "DELIVERED",
            createdAt: "2026-10-03T09:00:00Z",
            deliveredAt: "2026-10-05T12:00:00Z",
            trackingInfo: [{ company: "PostNL", number: "3SABC", url: "https://postnl.nl/t/3SABC" }]
          },
          {
            id: "gid://shopify/Fulfillment/62",
            status: "CANCELLED",
            displayStatus: null,
            createdAt: "2026-10-02T09:00:00Z",
            deliveredAt: null,
            trackingInfo: []
          }
        ],
        refunds: [{
          id: "gid://shopify/Refund/71",
          createdAt: "2026-10-06T08:00:00Z",
          note: "Te klein",
          totalRefundedSet: { shopMoney: { amount: "10.00", currencyCode: "EUR" } }
        }]
      }),
      "EUR"
    )
    expect(batch.orders[0]).toMatchObject({
      status: "delivered",
      payment_status: "partially_refunded",
      fulfillment_status: "fulfilled",
      shipped_at: "2026-10-03T09:00:00Z",
      refunded_at: null
    })
    expect(batch.fulfilments).toEqual([{
      shopify_id: "61",
      order_shopify_id: "6",
      status: "success",
      carrier: "PostNL",
      tracking_number: "3SABC",
      tracking_url: "https://postnl.nl/t/3SABC",
      shipped_at: "2026-10-03T09:00:00Z",
      delivered_at: "2026-10-05T12:00:00Z",
      tracking_status: "delivered"
    }])
    expect(batch.refunds).toMatchObject([{ shopify_id: "71", amount_minor: 1000, note: "Te klein" }])
  })

  it("reads a variant's stock per location from the bulk import, by its inventory item", () => {
    const batch = emptyBatch()
    addLine(batch, level(900, [{ name: "available", quantity: 14 }]), "EUR")
    addLine(batch, level(901, [{ name: "available", quantity: -2 }]), "EUR")
    // A level without the available count says nothing about what can be sold.
    addLine(batch, level(902, [{ name: "on_hand", quantity: 5 }]), "EUR")
    expect(batch.levels).toEqual([
      { inventory_item_id: "111", location_id: "900", available: 14, reported_at: "2026-09-15T08:00:00Z" },
      { inventory_item_id: "111", location_id: "901", available: -2, reported_at: "2026-09-15T08:00:00Z" }
    ])
    expect(batch.skipped).toBe(1)
    // Within Shopify's bulk limits: five connections at most, nested two deep.
    expect(PRODUCTS_QUERY.match(/edges/g)).toHaveLength(4)
    expect(PRODUCTS_QUERY).toContain("inventoryLevels { edges")
  })

  it("puts Shopify's statuses on Insyte's lifecycle", () => {
    const base = { cancelled: false, payment: "pending", fulfilment: "unfulfilled", parcels: [] } as const
    expect(orderStatus(base)).toBe("placed")
    expect(orderStatus({ ...base, payment: "paid" })).toBe("paid")
    expect(orderStatus({ ...base, payment: "paid", fulfilment: "partial", parcels: [{ delivered: true }] })).toBe(
      "shipped"
    )
    expect(orderStatus({ ...base, payment: "paid", fulfilment: "fulfilled", parcels: [{ delivered: false }] })).toBe(
      "shipped"
    )
    expect(orderStatus({ ...base, payment: "refunded", fulfilment: "fulfilled" })).toBe("refunded")
    expect(orderStatus({ ...base, cancelled: true, payment: "refunded" })).toBe("cancelled")
  })
})
