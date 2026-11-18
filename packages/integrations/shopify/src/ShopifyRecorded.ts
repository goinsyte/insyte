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
 * The order writes (M7.1) are taken as Shopify takes them; a `refuse-*` shop refuses each with a user error, and an
 * order has one open fulfillment order until it is fulfilled. A refund (M7.2) splits over one sale; the same
 * idempotency key answers the same refund. A return's writes (M9.3): a gift card or a discount code under a code made
 * before is taken; a draft order completes into one new order, the same one when completed again; a Shopify return is
 * approved or declined. A `noscope-*` shop approved the app before `write_gift_cards`, `write_discounts` and
 * `write_returns` joined its scopes, so Shopify denies those calls (`ACCESS_DENIED`). Insyte's drafts and new products (M7): a draft order is made
 * and deleted as asked, and found by its tag, but one for an address with `invalid` in it is refused on its email; a
 * product is made through `productSet` with its one variant, found by its handle and read back, but one titled with
 * `Geweigerd` is refused on its title. `productSet` with `identifier: { handle }` updates the shop's product with that
 * handle, or makes it; without one, a handle the shop already has is suffixed (`-1`), as Shopify does. A `lost-*` shop
 * makes its first draft or product and then fails the call, as an answer lost on the way back. A `slow-*` shop's first
 * product is still being made when the call times out: it fails the call, and the next read by its handle misses it. In a shop whose name holds `-lag-`, Shopify's search lags: a new draft is not found
 * by its tag on the first search after it was made. A test completes a draft as the merchant would (`completeRecordedDraft`).
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
/** The connection each child type sits in on its parent, as a GraphQL read nests it. */
const CONNECTION: Record<string, string> = { ProductVariant: "variants", MediaImage: "media", LineItem: "lineItems" }

/** An object as a GraphQL read answers it: nested connections, the shop's later changes applied. */
const nest = (shop: string, id: string): Record<string, unknown> | null => {
  const own = madeNodes.get(id)
  if (own !== undefined) return own
  const line = parsed.find((l) => l["id"] === id)
  if (line === undefined) return null
  const { __parentId: _, ...node } = line
  for (const { __parentId: _p, ...child } of parsed.filter((l) => l["__parentId"] === id)) {
    const connection = CONNECTION[String(child["id"]).split("/")[3] ?? ""]
    if (connection === undefined) continue
    const edges = ((node[connection] ??= { edges: [] }) as { edges: Array<{ node: unknown }> }).edges
    edges.push({ node: child })
  }
  return shop.startsWith("upd-") ? { ...node, ...RECORDED_UPDATES[id] } : node
}

/** The shop's setup as the first analysis reads it (M6.5): three countries, a long delivery, no rule for damage. */
const RECORDED_SHOP = {
  shipsToCountries: ["NL", "BE", "DE"],
  shopPolicies: [
    { type: "SHIPPING_POLICY", body: "<p>Je bestelling is binnen 7 tot 12 werkdagen bij je.</p>" },
    { type: "REFUND_POLICY", body: "<p>Retourneren kan binnen 30 dagen na ontvangst.</p>" }
  ]
}

/** The order writes (M7.1): Shopify's answer to each mutation, a refusal from a `refuse-*` shop. */
const MUTATIONS: Record<string, { readonly field?: string; readonly ok: Record<string, unknown> }> = {
  tagsAdd: { ok: { node: { id: "recorded" } } },
  tagsRemove: { ok: { node: { id: "recorded" } } },
  orderUpdate: { ok: { order: { id: "recorded" } } },
  fulfillmentCreate: { ok: { fulfillment: { id: "gid://shopify/Fulfillment/1", status: "SUCCESS" } } },
  orderCancel: { field: "orderCancelUserErrors", ok: { job: { id: "gid://shopify/Job/1" } } },
  refundCreate: { ok: { refund: { id: "gid://shopify/Refund/9001" } } },
  productUpdate: { ok: { product: { id: "recorded" } } },
  productVariantsBulkUpdate: { ok: { productVariants: [] } },
  customerCreate: { ok: { customer: { id: "gid://shopify/Customer/7001" } } },
  giftCardCreate: { ok: {} },
  discountCodeBasicCreate: { ok: {} },
  draftOrderCreate: { ok: {} },
  draftOrderComplete: { ok: {} },
  draftOrderDelete: { ok: {} },
  productSet: { ok: {} },
  productDelete: { ok: {} },
  returnApproveRequest: { ok: {} },
  returnDeclineRequest: { ok: {} },
  // The Live pixel (M14 step 3): created once per store, updated with a new key on a repair.
  webPixelCreate: { ok: { webPixel: { id: "gid://shopify/WebPixel/1" } } },
  webPixelUpdate: { ok: { webPixel: { id: "gid://shopify/WebPixel/1" } } },
  // The website chat's embed (M15 step 8): the app installation's own metafield, which says where Insyte's API is.
  metafieldsSet: { ok: { metafields: [] } },
  metafieldsDelete: { ok: { deletedMetafields: [] } }
}

/** The calls a `noscope-*` shop's token may not make, and the scope each needs. */
const NEWER_SCOPES: Record<string, string> = {
  giftCardCreate: "write_gift_cards",
  // An affiliate's code (M16 step 5) on a store that approved the app before `write_discounts`.
  discountCodeBasicCreate: "write_discounts",
  codeDiscountNodeByCode: "write_discounts",
  returnApproveRequest: "write_returns",
  returnDeclineRequest: "write_returns",
  webPixelCreate: "write_pixels",
  webPixelUpdate: "write_pixels"
}

/** Gift card codes made, draft orders made and what each completed into. */
const codes = new Set<string>()
interface RecordedDraft {
  readonly shop: string
  readonly tags: ReadonlyArray<string>
  readonly email: string | null
  readonly lines: ReadonlyArray<Record<string, unknown>>
  order: { id: string; name: string } | null
  /** Searches still to miss it, while Shopify's search index has not caught up. */
  unindexed: number
  readonly createdAt: string
}
const drafts = new Map<string, RecordedDraft>()
let made = 0

/** The code discounts each shop holds (\`shop|CODE\`), made through the twin or there before (\`seedRecordedDiscount\`). */
const discounts = new Map<string, { readonly id: string; readonly title: string }>()

/** A code discount the merchant made in Shopify's admin before Insyte came: a worker test's brand-owned code. */
export const seedRecordedDiscount = (shop: string, code: string, title: string) => {
  const id = `gid://shopify/DiscountCodeNode/${++made}`
  discounts.set(`${shop}|${code.toUpperCase()}`, { id, title })
  return id
}

/** A product made through `productSet` (M7.3), as Shopify holds it. */
export interface RecordedProduct {
  readonly id: string
  readonly variant: string
  /** Its one variant's inventory item, which Shopify's stock webhooks name. */
  readonly item: string
  readonly handle: string
  readonly title: string
  readonly status: string
  readonly price: string
  readonly sku: string | null
}
const products = new Map<string, RecordedProduct & { readonly shop: string; unread: number }>()

/** Objects made here (products, completed drafts' orders), as a single read answers them. */
const madeNodes = new Map<string, Record<string, unknown>>()

/** The products a shop holds that were made through the twin: a worker test reads what Shopify was sent. */
export const recordedProducts = (shop: string): ReadonlyArray<RecordedProduct> =>
  [...products.values()].filter((p) => p.shop === shop).map((p) => ({
    id: p.id,
    variant: p.variant,
    item: p.item,
    handle: p.handle,
    title: p.title,
    status: p.status,
    price: p.price,
    sku: p.sku
  }))

/** The draft orders a shop holds that were made through the twin, with their tags and lines. */
export const recordedDrafts = (shop: string) =>
  [...drafts.entries()].filter(([, d]) => d.shop === shop).map(([id, d]) => ({ id, ...d }))

/**
 * A draft completed in Shopify's admin, as the merchant would (M7.1): a new order with the draft's lines, paid by no
 * gateway Shopify names, that a single read then answers. Its gid and number, for the webhook a test delivers.
 */
export const completeRecordedDraft = (id: string) => {
  const draft = drafts.get(id)
  if (draft === undefined) throw new Error(`no recorded draft ${id}`)
  const n = ++made
  const order = { id: `gid://shopify/Order/${9000 + n}`, name: `#${1900 + n}` }
  draft.order = order
  const base = parsed.find((l) => l["id"] === "gid://shopify/Order/1")!
  const line = parsed.find((l) => l["id"] === "gid://shopify/LineItem/101")!
  const { __parentId: _, ...lineNode } = line
  madeNodes.set(order.id, {
    ...base,
    id: order.id,
    name: order.name,
    email: draft.email,
    customer: null,
    displayFinancialStatus: "PENDING",
    paymentGatewayNames: [],
    transactions: [],
    lineItems: { edges: [{ node: { ...lineNode, id: `gid://shopify/LineItem/${9500 + n}` } }] }
  })
  return order
}

/**
 * A draft copied in Shopify's admin, as a merchant would ("Dupliceren"): the same tags and lines, made at `createdAt`,
 * and already in the search index. Its gid.
 */
export const copyRecordedDraft = (id: string, createdAt: Date) => {
  const draft = drafts.get(id)
  if (draft === undefined) throw new Error(`no recorded draft ${id}`)
  const copy = `gid://shopify/DraftOrder/${++made}`
  drafts.set(copy, { ...draft, order: null, unindexed: 0, createdAt: createdAt.toISOString() })
  return copy
}

/** Shops whose answer to a create is lost once: Shopify made it, the call failed on the way back. */
const lostOnce = new Set<string>()

/** A code made before, as Shopify answers it. */
const taken = (field: string) => ({
  userErrors: [{ field: [field, "code"], code: "TAKEN", message: "Code has already been taken" }]
})

/** A return's write (M9.3) as Shopify answers it; `undefined` for the other mutations. */
const returnWrite = (
  shop: string,
  name: string,
  variables: Record<string, unknown>
): Record<string, unknown> | undefined => {
  const input = (variables["input"] ?? variables["basicCodeDiscount"] ?? {}) as Record<string, unknown>
  switch (name) {
    case "giftCardCreate": {
      const code = String(input["code"] ?? "")
      if (codes.has(code)) return taken("input")
      codes.add(code)
      return {
        giftCard: { id: `gid://shopify/GiftCard/${++made}`, maskedCode: `•••• •••• •••• ${code.slice(-4)}` },
        giftCardCode: code
      }
    }
    case "discountCodeBasicCreate": {
      const key = `${shop}|${String(input["code"] ?? "").toUpperCase()}`
      if (discounts.has(key)) return taken("basicCodeDiscount")
      const id = `gid://shopify/DiscountCodeNode/${++made}`
      discounts.set(key, { id, title: String(input["title"] ?? "") })
      return { codeDiscountNode: { id } }
    }
    case "draftOrderCreate": {
      if (String(input["email"] ?? "").includes("invalid")) {
        return { userErrors: [{ field: ["email"], message: "Email is invalid" }] }
      }
      const id = `gid://shopify/DraftOrder/${++made}`
      drafts.set(id, {
        shop,
        tags: (input["tags"] as ReadonlyArray<string> | undefined) ?? [],
        email: typeof input["email"] === "string" ? input["email"] : null,
        lines: (input["lineItems"] as ReadonlyArray<Record<string, unknown>> | undefined) ?? [],
        order: null,
        unindexed: shop.includes("-lag-") ? 1 : 0,
        createdAt: new Date().toISOString()
      })
      return { draftOrder: { id, name: `#D${made}` } }
    }
    case "draftOrderDelete": {
      const id = String(input["id"] ?? "")
      if (!drafts.has(id)) return { userErrors: [{ field: ["id"], message: "Draft order does not exist" }] }
      drafts.delete(id)
      return { deletedId: id }
    }
    case "productSet": {
      const product = (variables["input"] ?? {}) as Record<string, unknown>
      if (String(product["title"] ?? "").includes("Geweigerd")) {
        return { userErrors: [{ field: ["input", "title"], message: "Title is not allowed" }] }
      }
      const variant = ((product["variants"] as ReadonlyArray<Record<string, unknown>> | undefined) ?? [])[0] ?? {}
      const sku = (variant["inventoryItem"] as { sku?: string } | undefined)?.sku ?? null
      const handle = String(product["handle"] ?? "")
      const held = [...products.values()].filter((p) => p.shop === shop)
      // By its handle, Shopify's upsert: the product with it, updated in place.
      const by = (variables["identifier"] as { handle?: string } | undefined)?.handle
      const same = by === undefined ? undefined : held.find((p) => p.handle === by)
      const n = same === undefined ? ++made : 0
      const ids = same === undefined
        ? {
          id: `gid://shopify/Product/${8000 + n}`,
          variant: `gid://shopify/ProductVariant/${8500 + n}`,
          item: `gid://shopify/InventoryItem/${8700 + n}`
        }
        : { id: same.id, variant: same.variant, item: same.item }
      const used = same === undefined && held.some((p) => p.handle === handle)
      const kept = {
        shop,
        id: ids.id,
        variant: ids.variant,
        item: ids.item,
        handle: used ? `${handle}-1` : handle,
        title: String(product["title"] ?? ""),
        status: String(product["status"] ?? "DRAFT"),
        price: String(variant["price"] ?? "0.00"),
        sku,
        // A `slow-*` shop's first product is not read back by its handle once.
        unread: same === undefined && shop.startsWith("slow-") && held.length === 0 ? 1 : (same?.unread ?? 0)
      }
      products.set(ids.id, kept)
      const base = parsed.find((l) => l["id"] === "gid://shopify/Product/3")!
      const baseVariant = parsed.find((l) => l["id"] === "gid://shopify/ProductVariant/31")!
      const { __parentId: _, ...variantNode } = baseVariant
      madeNodes.set(ids.id, {
        ...base,
        id: ids.id,
        title: kept.title,
        handle: kept.handle,
        status: kept.status,
        descriptionHtml: String(product["descriptionHtml"] ?? ""),
        variants: {
          edges: [{
            node: {
              ...variantNode,
              id: ids.variant,
              sku,
              price: kept.price,
              inventoryItem: { id: ids.item, tracked: true }
            }
          }]
        }
      })
      return {
        product: { id: ids.id, variants: { nodes: [{ id: ids.variant, inventoryItem: { id: ids.item } }] } }
      }
    }
    case "productDelete": {
      const id = String(input["id"] ?? "")
      if (!products.has(id)) return { userErrors: [{ field: ["id"], message: "Product does not exist" }] }
      products.delete(id)
      madeNodes.delete(id)
      return { deletedProductId: id }
    }
    case "draftOrderComplete": {
      const id = String(variables["id"] ?? "")
      const draft = drafts.get(id)
      if (draft === undefined) return { userErrors: [{ field: ["id"], message: "Conceptbestelling bestaat niet" }] }
      draft.order ??= { id: `gid://shopify/Order/${9000 + ++made}`, name: `#${1900 + made}` }
      return { draftOrder: { id, order: draft.order } }
    }
    case "returnApproveRequest":
      return { return: { id: input["id"], status: "OPEN" } }
    case "returnDeclineRequest":
      return { return: { id: input["id"], status: "DECLINED" } }
    default:
      return undefined
  }
}

/** Refunds by idempotency key: the same key answers the same refund, as Shopify does. */
const refundIds = new Map<string, number>()
const refundsTaken = (key: string) => {
  if (!refundIds.has(key)) refundIds.set(key, 9000 + refundIds.size + 1)
  return refundIds.get(key)!
}

/** The Live pixel's settings each shop was last given (M14 step 3): a worker test reads the ingest key from here. */
export const recordedPixelSettings = new Map<string, string>()

/** The app installation's metafields each shop was last given (`namespace.key` → value), for the worker tests. */
export const recordedAppMetafields = new Map<string, Map<string, string>>()

const recordedMutation = (shop: string, query: string, variables: Record<string, unknown>): unknown | undefined => {
  const name = Object.keys(MUTATIONS).find((m) => query.includes(`${m}(`))
  if (name === undefined) return undefined
  if (name === "metafieldsSet" && !shop.startsWith("refuse-")) {
    const fields = (variables["metafields"] ?? []) as ReadonlyArray<
      { ownerId?: string; namespace?: string; key?: string; value?: string }
    >
    const held = recordedAppMetafields.get(shop) ?? new Map<string, string>()
    for (const f of fields) {
      if (f.ownerId === "gid://shopify/AppInstallation/1") held.set(`${f.namespace}.${f.key}`, String(f.value))
    }
    recordedAppMetafields.set(shop, held)
  }
  if (name === "metafieldsDelete" && !shop.startsWith("refuse-")) {
    const fields = (variables["metafields"] ?? []) as ReadonlyArray<
      { ownerId?: string; namespace?: string; key?: string }
    >
    for (const f of fields) {
      if (f.ownerId === "gid://shopify/AppInstallation/1") {
        recordedAppMetafields.get(shop)?.delete(`${f.namespace}.${f.key}`)
      }
    }
  }
  // A `pixeltaken-*` shop already has the app's pixel, whose id Insyte lost: Shopify refuses a second one.
  if (name === "webPixelCreate" && shop.startsWith("pixeltaken-")) {
    return { webPixelCreate: { userErrors: [{ field: ["webPixel"], code: "TAKEN", message: "Pixel already exists" }] } }
  }
  if ((name === "webPixelCreate" || name === "webPixelUpdate") && !shop.startsWith("refuse-")) {
    recordedPixelSettings.set(shop, String((variables["webPixel"] as { settings?: unknown } | undefined)?.settings))
  }
  const { field = "userErrors", ok } = MUTATIONS[name]!
  const refused = shop.startsWith("refuse-")
  if (refused) return { [name]: { [field]: [{ field: ["id"], message: "Deze bestelling kan niet worden gewijzigd" }] } }
  // A refund is Shopify's own, under the idempotency key it was asked with.
  const answer = name === "refundCreate"
    ? { refund: { id: `gid://shopify/Refund/${refundsTaken(String(variables["key"] ?? ""))}` } }
    : returnWrite(shop, name, variables) ?? ok
  return { [name]: { [field]: [], ...answer } }
}

/** A call the shop's token may not make, as Shopify answers it: denied, with the scope it needs. */
const deniedFor = (shop: string, query: string): ShopifyRefused | undefined => {
  if (!shop.startsWith("noscope-")) return undefined
  const name = Object.keys(NEWER_SCOPES).find((m) => query.includes(`${m}(`))
  if (name === undefined) return undefined
  const scope = NEWER_SCOPES[name]!
  return new ShopifyRefused({
    status: 403,
    reason: `Access denied for ${name} field. Required access: \`${scope}\` access scope.`,
    scope
  })
}

const recordedQuery = (shop: string, query: string, variables: Record<string, unknown>): unknown => {
  const mutation = recordedMutation(shop, query, variables)
  if (mutation !== undefined) return mutation
  // The discount a code belongs to in this shop, if any.
  if (query.includes("codeDiscountNodeByCode(")) {
    const found = discounts.get(`${shop}|${String(variables["code"] ?? "").toUpperCase()}`)
    return {
      codeDiscountNodeByCode: found === undefined ? null : { id: found.id, codeDiscount: { title: found.title } }
    }
  }
  // A draft by the tag Insyte gave it (`tag:'SO-10001'`), and a product by its handle: what a create tried again finds.
  if (query.includes("draftOrders(")) {
    const tag = /tag:'([^']*)'/.exec(String(variables["query"] ?? ""))?.[1]
    const first = Number(/first: (\d+)/.exec(query)?.[1] ?? 50)
    const found = [...drafts.entries()].filter(([, d]) => d.shop === shop && tag !== undefined && d.tags.includes(tag))
    // One the index has not caught up with is missed, this once.
    const indexed = found.filter(([, d]) => {
      if (d.unindexed <= 0) return true
      d.unindexed -= 1
      return false
    })
    return {
      draftOrders: {
        nodes: indexed.slice(0, first).map(([id, d]) => ({
          id,
          status: d.order === null ? "OPEN" : "COMPLETED",
          createdAt: d.createdAt
        }))
      }
    }
  }
  // Drafts by their ids, as they are now: a completed one names its order.
  if (query.includes("nodes(ids:")) {
    const ids = (variables["ids"] as ReadonlyArray<string> | undefined) ?? []
    return {
      nodes: ids.map((id) => {
        const d = drafts.get(id)
        return d === undefined || d.shop !== shop
          ? null
          : { id, status: d.order === null ? "OPEN" : "COMPLETED", order: d.order === null ? null : { id: d.order.id } }
      })
    }
  }
  if (query.includes("productByIdentifier(")) {
    const found = [...products.values()].find((p) => {
      if (p.shop !== shop || p.handle !== variables["handle"]) return false
      if (p.unread <= 0) return true
      p.unread -= 1
      return false
    })
    return {
      productByIdentifier: found === undefined
        ? null
        : { id: found.id, variants: { nodes: [{ id: found.variant, inventoryItem: { id: null } }] } }
    }
  }
  // The order's single sale, as a full refund splits it: a `short-*` shop sees only €10 of it.
  if (query.includes("suggestedRefund(")) {
    return {
      order: {
        suggestedRefund: {
          suggestedTransactions: [{
            parentTransaction: { id: "gid://shopify/OrderTransaction/1" },
            gateway: "shopify_payments",
            amountSet: { shopMoney: { amount: shop.startsWith("short-") ? "10.00" : "100000.00" } }
          }]
        }
      }
    }
  }
  // One open fulfillment order with the order's lines, each still to ship in full.
  if (query.includes("fulfillmentOrders(")) {
    const lines = parsed.filter((l) => l["__parentId"] === variables["id"] && String(l["id"]).includes("/LineItem/"))
    return {
      order: {
        fulfillmentOrders: {
          nodes: [{
            id: "gid://shopify/FulfillmentOrder/1",
            status: "OPEN",
            lineItems: {
              nodes: lines.map((l) => ({
                id: `gid://shopify/FulfillmentOrderLineItem/${String(l["id"]).split("/").pop()}`,
                remainingQuantity: Number(l["quantity"] ?? 1),
                lineItem: { id: l["id"] }
              }))
            }
          }]
        }
      }
    }
  }
  if (query.includes("node(id:")) return { node: nest(shop, String(variables["id"])) }
  if (query.includes("shipsToCountries")) return { shop: { shipsToCountries: RECORDED_SHOP.shipsToCountries } }
  if (query.includes("primaryDomain")) {
    return { shop: { primaryDomain: { url: `https://www.${shop.replace(".myshopify.com", "")}.test` } } }
  }
  if (query.includes("currentAppInstallation")) {
    return { currentAppInstallation: { id: "gid://shopify/AppInstallation/1" } }
  }
  if (query.includes("webPixel {")) return { webPixel: { id: "gid://shopify/WebPixel/7" } }
  if (query.includes("shopPolicies")) return { shop: { shopPolicies: RECORDED_SHOP.shopPolicies } }
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
  query: (shop, _token, query, variables) => {
    const denied = deniedFor(shop, query)
    if (denied !== undefined) return Effect.fail(denied)
    const data = recordedQuery(shop, query, variables)
    // A `lost-*` shop makes its first draft or product, and the answer never arrives: a gateway error, tried again.
    const create = query.includes("draftOrderCreate(") || query.includes("productSet(")
    if (create && (shop.startsWith("lost-") || shop.startsWith("slow-")) && !lostOnce.has(shop)) {
      lostOnce.add(shop)
      return Effect.fail(new ShopifyRefused({ status: 502, reason: "Bad Gateway" }))
    }
    return Effect.succeed({ data, throttle: { maximumAvailable: 2000, currentlyAvailable: 1990, restoreRate: 100 } })
  },
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
  uninstall: () => Effect.void,
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
