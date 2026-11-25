import { expect } from "vitest"
import { run } from "./journeys.ts"
import { call } from "./support.ts"

/*
 * Orders in another currency than the workspace's, and the rates they are converted at. The ECB's recorded twin ends on
 * a fixed day, so its rates age past what a limit is still held with (`RATE_MAX_AGE_DAYS`): a test that needs a rate
 * of today writes one (`setRates`), at the twin's own value, so whatever else reads the latest rate gets the same.
 */

/** 1 USD in EUR on the twin's last day, 10 November 2026: 1 / 1.1214. */
export const USD_EUR = "0.89174246"

/** Rates of so many days ago (`ageDays`); with `replace`, in place of every rate the pair had. */
export const setRates = async (
  rates: ReadonlyArray<{ base: string; quote: string; rate: string; ageDays: number }>,
  replace = false
) => {
  const written = await call("http://api.test/api/__dev/fx/rates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rates, replace })
  })
  expect(written.status).toBe(200)
}

/** A paid order of one line at `totalMinor` in `currency` into the store's mirror, as the import writes one. */
export const paidOrder = async (
  store: { workspace: string; storeId: string },
  number: string,
  currency: string,
  totalMinor = 15000
) => {
  const at = new Date(Date.now() - 3_600_000).toISOString()
  const shopifyId = `gid://shopify/Order/${number.slice(1)}${run}`
  const line = {
    shopify_id: `gid://shopify/LineItem/${number.slice(1)}${run}`,
    order_shopify_id: shopifyId,
    product_shopify_id: null,
    variant_shopify_id: null,
    sku: null,
    title: "Jas",
    variant_title: null,
    quantity: 1,
    unit_price_minor: totalMinor
  }
  const order = {
    shopify_id: shopifyId,
    number,
    customer_shopify_id: null,
    customer_name: "Klant VS",
    customer_email: null,
    status: "paid",
    payment_status: "paid",
    fulfillment_status: "unfulfilled",
    total_minor: totalMinor,
    subtotal_minor: totalMinor,
    shipping_minor: 0,
    tax_minor: 0,
    discounts_minor: 0,
    currency,
    payment_gateway: null,
    card_last4: null,
    shipping_address: {
      name: "Klant VS",
      line1: "1 Main St",
      line2: null,
      city: "Austin",
      postcode: "78701",
      region: "TX",
      country: "US",
      phone: null
    },
    tags: [],
    note: null,
    channel: "web",
    referral_code: null,
    placed_at: at,
    paid_at: at,
    shipped_at: null,
    cancelled_at: null,
    refunded_at: null,
    external_updated_at: at,
    raw: {}
  }
  const written = await call(
    `http://api.test/api/__dev/facts/orders?workspace=${store.workspace}&store=${store.storeId}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch: { orders: [order], lines: [line] } })
    }
  )
  expect(written.status).toBe(200)
}

/** The latest rate of 1 `base` into `quote`, as `fx_rates` holds it. */
export const latestRate = async (base: string, quote: string) => {
  const rates = (await (await call("http://api.test/api/__dev/fx")).json() as {
    rates: Array<{ day: string; base: string; quote: string; rate: string }>
  }).rates.filter((r) => r.base === base && r.quote === quote).toSorted((a, b) => b.day.localeCompare(a.day))
  return Number(rates[0]!.rate)
}
