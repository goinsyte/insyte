import {
  type BulkStatus,
  type ShopFacts,
  ShopifyAdmin,
  ShopifyGraphql,
  ShopifyRefused,
  type ShopifyTokens
} from "@insyte/modules/stores/domain/Ports"
import { Effect, Layer, Redacted } from "effect"
import { RECORDED_BULK, RECORDED_UPDATES } from "./RecordedBulk.ts"
import { readLines } from "./ShopifyGraphql.ts"

/*
 * Shopify's recorded twin (integrations.md §1.1): the worker tests and local runs without an app connect a store
 * through it, so CI never calls Shopify. Any shop exists but `missing-*`; the code `refused` is refused, like a
 * replayed one; every callback signed `valid` verifies. The facts are what a fresh development store reports. The code
 * `short` gives a token that is already due for a refresh; a refresh token from the code `revoked` is refused, as a
 * store that uninstalled the app answers. Bulk operations finish on the second poll with `RecordedBulk`'s files
 * (an `empty-*` shop finds nothing). Single reads and the reconcile pages answer from the same files; an `upd-*` shop
 * holds `RECORDED_UPDATES` on top, as a store that changed since its import. Every webhook signed `valid` verifies.
 */

export const RECORDED_FACTS: ShopFacts = {
  name: "Insyte MVP Test",
  currency: "EUR",
  timezone: "Europe/Amsterdam",
  country: "NL",
  planName: "Development"
}

/** How many refreshes the twin answered in this isolate: the gate's single flight shows as one. */
let refreshes = 0
export const recordedRefreshes = () => refreshes

const issued = (code: string, lifetimeMs: number): ShopifyTokens => ({
  accessToken: Redacted.make(`recorded-access-${code}`),
  refreshToken: Redacted.make(`recorded-refresh-${code}`),
  expiresAt: new Date(Date.now() + lifetimeMs),
  refreshExpiresAt: new Date(Date.now() + 90 * 86_400_000),
  scopes: ["read_orders", "read_products", "read_customers"]
})

const RECORDED_HOST = "https://recorded.shopify.test/bulk/"
const resourceOf = (query: string): keyof typeof RECORDED_BULK =>
  query.includes("products {") ? "products" : query.includes("customers {") ? "customers" : "orders"
const polls = new Map<string, number>()

/** The fixture's objects by gid, and each one's children, parsed once. */
const parsed = Object.values(RECORDED_BULK).flatMap((text) =>
  text.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as Record<string, unknown>)
)
const CHILDREN: Record<string, string> = { Product: "variants", Order: "lineItems" }

/** An object as a GraphQL read answers it: nested connections, the shop's later changes applied. */
const nest = (shop: string, id: string): Record<string, unknown> | null => {
  const line = parsed.find((l) => l["id"] === id)
  if (line === undefined) return null
  const { __parentId: _, ...node } = line
  const type = id.split("/")[3] ?? ""
  const connection = CHILDREN[type]
  if (connection !== undefined) {
    node[connection] = {
      edges: parsed.filter((l) => l["__parentId"] === id).map(({ __parentId: _p, ...child }) => ({ node: child }))
    }
  }
  return shop.startsWith("upd-") ? { ...node, ...RECORDED_UPDATES[id] } : node
}

const recordedQuery = (shop: string, query: string, variables: Record<string, unknown>): unknown => {
  if (query.includes("node(id:")) return { node: nest(shop, String(variables["id"])) }
  const field = ["products", "customers", "orders"].find((f) => query.includes(`${f}(first:`))!
  const type = field === "products" ? "Product" : field === "customers" ? "Customer" : "Order"
  const ids = parsed.filter((l) => String(l["id"]).split("/")[3] === type && l["__parentId"] === undefined)
  return {
    [field]: {
      pageInfo: { hasNextPage: false, endCursor: null },
      edges: ids.map((l) => ({ node: nest(shop, String(l["id"])) }))
    }
  }
}

export const ShopifyGraphqlRecorded = Layer.succeed(ShopifyGraphql)(ShopifyGraphql.of({
  query: (shop, _token, query, variables) =>
    Effect.succeed({
      data: recordedQuery(shop, query, variables),
      throttle: { maximumAvailable: 2000, currentlyAvailable: 1990, restoreRate: 100 }
    }),
  start: (shop, _token, query) =>
    Effect.succeed({
      id: `gid://shopify/BulkOperation/${shop.startsWith("empty-") ? "empty" : resourceOf(query)}-${Date.now()}`,
      throttle: { maximumAvailable: 2000, currentlyAvailable: 1990, restoreRate: 100 }
    }),
  status: (_shop, _token, id) => {
    const seen = (polls.get(id) ?? 0) + 1
    polls.set(id, seen)
    const resource = id.split("/").at(-1)!.split("-")[0]!
    const status: BulkStatus["status"] = seen < 2 ? "RUNNING" : "COMPLETED"
    const done = status === "COMPLETED"
    return Effect.succeed({
      status,
      errorCode: null,
      objectCount: done && resource !== "empty"
        ? RECORDED_BULK[resource as keyof typeof RECORDED_BULK].split("\n").length - 1
        : 0,
      url: done && resource !== "empty" ? `${RECORDED_HOST}${resource}.jsonl` : null,
      throttle: { maximumAvailable: 2000, currentlyAvailable: 1999, restoreRate: 100 }
    })
  },
  read: (url, offset, maxLines) =>
    Effect.tryPromise({
      try: () => {
        const resource = url.slice(RECORDED_HOST.length).replace(/\.jsonl$/, "") as keyof typeof RECORDED_BULK
        const bytes = new TextEncoder().encode(RECORDED_BULK[resource]).subarray(offset)
        return readLines(new Blob([bytes]).stream(), 0, offset, maxLines)
      },
      catch: (error) => new ShopifyRefused({ status: 0, reason: String(error) })
    })
}))

export const ShopifyRecorded = Layer.succeed(ShopifyAdmin)(ShopifyAdmin.of({
  configured: true,
  authorizeUrl: ({ shop, state, redirectUri }) =>
    `https://${shop}/admin/oauth/authorize?client_id=recorded&state=${state}&redirect_uri=${
      encodeURIComponent(redirectUri)
    }`,
  verifyCallback: (query) => Effect.succeed(query["hmac"] === "valid"),
  verifyWebhook: (_body, hmac) => Effect.succeed(hmac === "valid"),
  exists: (shop) => Effect.succeed(!shop.startsWith("missing-")),
  exchange: (_shop, code) =>
    code === "refused"
      ? Effect.fail(new ShopifyRefused({ status: 400, reason: "invalid_request" }))
      : Effect.succeed(issued(code, code === "short" ? 60_000 : 3_600_000)),
  refresh: (_shop, refreshToken) => {
    const spent = Redacted.value(refreshToken)
    if (spent.includes("revoked")) return Effect.fail(new ShopifyRefused({ status: 401, reason: "invalid_grant" }))
    refreshes++
    return Effect.succeed(issued(`r${refreshes}`, 3_600_000))
  },
  facts: () => Effect.succeed(RECORDED_FACTS)
}))
