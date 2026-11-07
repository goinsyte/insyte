/**
 * NOT PORTED — written for this repo. See ADR-0004, and ADR-0005 for why the check is gone.
 *
 * Legacy is an Eden Treaty client typed end-to-end from the Elysia server's `App` type, with the
 * session in a cross-origin cookie, a correlation id per request and a 401 bounce to `/login`.
 *
 * This repo has no server, and ten surfaces read through it: the order, product and
 * customer lists, the product detail screen, the store switcher, the KPI strip, the revenue chart,
 * the fulfilment funnel, the Shopify settings panel and the onboarding flow's own progress. Left
 * unanswered they render empty, which is
 * what the legacy app does locally today and is not what "the frontend, ported" means.
 *
 * So this serves the same call shapes from `lib/mock-data`, which is where every other number on
 * these screens already comes from. It keeps the legacy module's path and export name, so
 * `hooks/use-operator-data.ts` and `hooks/use-shopify-status.ts` are ported unedited — including
 * the type-level probes they do (`Awaited<ReturnType<typeof api.operators.stores.get>>`), which is
 * why the shapes below are written out rather than widened to `any`.
 *
 * What it is not: a server. There is no latency, no error path, no pagination and no auth. The
 * nearest real thing is `packages/modules` in Phase 2, and this file is the seam it lands on.
 */
import { customers } from "../../data-source"
import { orders } from "../../data-source"
import { products } from "../../data-source"
import { stores } from "../../data-source"
import type { Customer, Order, Product } from "./types/domain"

/** The store shape the operator API returns, which is not the mock `Store`: the screens read
 * `status`, and `useActiveStore` maps it to `connected`. */
type ApiStore = {
  id: string
  name: string
  domain: string
  currency: string
  status: "active" | "disconnected"
}

type Metrics = {
  currency: string
  revenue: number
  orders: number
  customers: number
  aov: number
  refunds: number
  revenueSeries: Array<{ label: string; value: number }>
  fulfillment: Array<{ stage: string; count: number }>
}

type ShopifyStatus = {
  connected: boolean
  syncing: boolean
  counts: { products: number; orders: number; customers: number }
}

const ok = <A>(data: A) => Promise.resolve({ data, error: null })

/* ── metrics, computed from the mock orders rather than written down ──────────────────────────── */

const DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 }

/* Functions, not values: this module loads in the console too (the onboarding steps reach it), where no data source is
   installed and a read at load would throw. */
const dated = () => orders.toSorted((a, b) => a.created_at.localeCompare(b.created_at))

/** The mock orders are dated across 2026; "now" is the last of them, so a range is never empty. */
const latestOf = (sorted: ReadonlyArray<Order>) => new Date(sorted[sorted.length - 1]?.created_at ?? Date.now())

const within = (range: string): Array<Order> => {
  const sorted = dated()
  const latest = latestOf(sorted)
  if (range === "ytd") {
    const start = new Date(Date.UTC(latest.getUTCFullYear(), 0, 1)).toISOString()
    return sorted.filter((order) => order.created_at >= start)
  }
  const days = DAYS[range] ?? 30
  const start = new Date(latest.getTime() - days * 86_400_000).toISOString()
  return sorted.filter((order) => order.created_at >= start)
}

const metricsFor = (range: string): Metrics => {
  const window = within(range)
  const revenue = window.reduce((sum, order) => sum + order.total, 0)
  const refunds = window
    .filter((order) => order.payment_status === "refunded" || order.status === "refunded")
    .reduce((sum, order) => sum + order.total, 0)

  // One bucket per month for a year, per day otherwise — which is what the chart's own label
  // formatter already switches on.
  const key = (iso: string) => (range === "ytd" ? `${iso.slice(0, 7)}-01` : iso.slice(0, 10))
  const buckets = new Map<string, number>()
  for (const order of window) buckets.set(key(order.created_at), (buckets.get(key(order.created_at)) ?? 0) + order.total)

  const reached = (...statuses: Array<Order["status"]>) =>
    window.filter((order) => statuses.includes(order.status)).length

  return {
    currency: "USD",
    revenue,
    orders: window.length,
    customers: new Set(window.map((order) => order.customer_id)).size,
    aov: window.length === 0 ? 0 : revenue / window.length,
    refunds,
    revenueSeries: [...buckets.entries()]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label: `${label}T00:00:00Z`, value })),
    fulfillment: [
      { stage: "Placed", count: window.length },
      { stage: "Paid", count: reached("paid", "at_supplier", "shipped", "delivered") },
      { stage: "Shipped", count: reached("shipped", "delivered") },
      { stage: "Delivered", count: reached("delivered") }
    ]
  }
}

/* ── onboarding, which is a state machine rather than a table ─────────────────────────────────── */

/*
 * Legacy's onboarding progress lives on the server: the flow posts each completed step to
 * `/onboarding/advance` and reads the step to resume at from `/onboarding/me`, so closing the tab
 * mid-signup and coming back lands on the right screen.
 *
 * Here it lives in this module, for as long as the tab is open. The ordered list below is legacy's
 * server step order, and `me` answers with the one after the last step posted — which is what makes
 * the ported resume path run rather than sit unreachable. A browser reload starts the flow over;
 * any step can also be opened directly with `?persona=admin&step=4`, which is the ported route's
 * own deep link.
 */
const STEPS = ["account", "verify", "organization", "plan", "store", "sync", "analysis", "offline", "ready"] as const

let completed: string | null = null
let collected: Record<string, unknown> = {}

const nextStep = (): string => {
  const at = completed === null ? -1 : STEPS.indexOf(completed as (typeof STEPS)[number])
  return STEPS[at + 1] ?? "dashboard"
}

/* ── the client ───────────────────────────────────────────────────────────────────────────────── */

const product = Object.assign(
  ({ id }: { id: string }) => ({
    get: () => ok<Product | null>(products.find((candidate) => candidate.id === id) ?? null)
  }),
  { get: () => ok<Array<Product>>(products) }
)

export const api = {
  onboarding: {
    me: {
      get: () => ok<{ nextStep: string; payload: Record<string, unknown> }>({ nextStep: nextStep(), payload: collected })
    },
    advance: {
      post: ({ step, data }: { step: string; data?: Record<string, unknown> }) => {
        completed = step
        collected = { ...collected, ...data }
        return ok<{ nextStep: string }>({ nextStep: nextStep() })
      }
    }
  },

  operators: {
    orders: { get: () => ok<Array<Order>>(dated()) },
    products: product,
    customers: { get: () => ok<Array<Customer>>(customers) },
    stores: {
      get: () =>
        ok<Array<ApiStore>>(
          stores.map((store) => ({
            id: store.id,
            name: store.name,
            domain: store.domain,
            currency: store.currency,
            status: store.connected ? "active" : "disconnected"
          }))
        )
    },
    metrics: { get: ({ query }: { query: { range: string } }) => ok<Metrics>(metricsFor(query.range)) },
    "shopify-status": {
      get: () =>
        ok<ShopifyStatus>({
          connected: stores.some((store) => store.connected),
          syncing: false,
          counts: { products: products.length, orders: orders.length, customers: customers.length }
        })
    },
    shopify: { resync: { post: () => ok<null>(null) } }
  }
}
