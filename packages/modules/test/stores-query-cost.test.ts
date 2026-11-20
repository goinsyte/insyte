import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import * as CustomersWriteBack from "../src/customers/domain/WriteBack.ts"
import * as OrdersWriteBack from "../src/orders/domain/WriteBack.ts"
import * as ProductsWriteBack from "../src/products/domain/WriteBack.ts"
import * as ReturnsShopify from "../src/returns/domain/Shopify.ts"
import {
  backfillQuery,
  type BackfillResource,
  changedQuery,
  childFields,
  childQuery,
  type MirrorKind,
  NODE_QUERY
} from "../src/stores/domain/Mirror.ts"
import { MAX_QUERY_COST, requestedCost } from "../src/stores/domain/QueryCost.ts"

/*
 * Shopify refuses a query whose requested cost is over 1000 points before running it (MAX_COST_EXCEEDED), whatever the
 * bucket holds. `requestedCost` counts its documented rule, an upper bound (Shopify prices large connections lower), and
 * every query Insyte sends is held under 900 by it: the mirror's pages, single reads and further pages of a node's
 * children, the writes, and every other query text in the code, found by reading the sources.
 */

/** Under Shopify's limit with room to spare. */
const BUDGET = 900

const RESOURCES: ReadonlyArray<BackfillResource> = ["products", "stock", "customers", "orders"]
const KINDS: ReadonlyArray<MirrorKind> = ["Product", "Customer", "Order"]
const TYPES = ["Product", "InventoryItem", "Customer", "Order"]

/** The mirror's reads, by what asks them. */
const mirrorQueries = (): Record<string, string> => ({
  ...Object.fromEntries(RESOURCES.map((r) => [`backfill.${r}`, backfillQuery(r)])),
  ...Object.fromEntries(KINDS.map((k) => [`changed.${k}`, changedQuery(k)])),
  node: NODE_QUERY,
  ...Object.fromEntries(TYPES.flatMap((t) => childFields(t).map((f) => [`child.${t}.${f}`, childQuery(t, f)])))
})

/** Every exported GraphQL text of the write slices, by its name. */
const writeQueries = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries<unknown>({ ...CustomersWriteBack, ...OrdersWriteBack, ...ProductsWriteBack, ...ReturnsShopify })
      .flatMap(([name, value]) => typeof value === "string" && isOperation(value) ? [[name, value]] : [])
  )

/** A GraphQL operation's text: `query … {`, `mutation … {`, or a bare `{ field … }`. */
const isOperation = (text: string) =>
  /^\s*(?:(?:query|mutation)\b[^{]*)?\{\s*[A-Za-z_]/.test(text) && text.trim().endsWith("}")

const ROOT = join(import.meta.dirname, "../../..")
const SOURCES = ["packages/modules/src", "packages/integrations/shopify/src", "apps/api/src"]

const filesIn = (dir: string): Array<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesIn(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

/** The mirror's file: its queries are built from parts, and counted above from what its builders give. */
const BUILT = "packages/modules/src/stores/domain/Mirror.ts"

/**
 * The literal opened at `start` (a quote or a backtick): its text, with each `${…}` as `${}`, and where it ends. A
 * placeholder's own code is skipped whole, nested templates and braces included.
 */
const literalAt = (source: string, start: number): { readonly text: string; readonly end: number } => {
  const quote = source[start]!
  let text = ""
  let at = start + 1
  while (at < source.length && source[at] !== quote) {
    if (source[at] === "\\") {
      text += source.slice(at, at + 2)
      at += 2
    } else if (quote === "`" && source.startsWith("${", at)) {
      let depth = 0
      at += 1
      do {
        if (source[at] === "`" || source[at] === "\"" || source[at] === "'") at = literalAt(source, at).end
        else {
          if (source[at] === "{") depth++
          if (source[at] === "}") depth--
          at++
        }
      } while (depth > 0 && at < source.length)
      text += "${}"
    } else text += source[at++]
  }
  return { text, end: at + 1 }
}

/** A literal that opens as a GraphQL operation: `query`, `mutation`, or `{ field {`. */
const OPENS = /[`"](?=\s*(?:query|mutation)\b[^`"\n]*[({]|\s*\{\s*[a-z]\w*\s*\{)/g

/** Every string or template literal in the sources that is a GraphQL operation, by where it is. */
const sourceQueries = () => {
  const found: Array<{ readonly at: string; readonly text: string }> = []
  for (const file of SOURCES.flatMap((dir) => filesIn(join(ROOT, dir)))) {
    const source = readFileSync(file, "utf8")
    for (let match = OPENS.exec(source); match !== null; match = OPENS.exec(source)) {
      const { text, end } = literalAt(source, match.index)
      OPENS.lastIndex = end
      if (!text.includes("${}") && !isOperation(text)) continue
      found.push({ at: `${relative(ROOT, file)}:${source.slice(0, match.index).split("\n").length}`, text })
    }
  }
  return found
}

/** As many ids as `nodes(ids:)` takes: the dearest a `nodes` read can be. */
const WORST = { ids: Array.from({ length: 250 }, (_, i) => `gid://shopify/Node/${i}`) }

describe("what Insyte asks Shopify for", () => {
  it("counts a query as Shopify's documented rule does", () => {
    // Ten products with five variants each, scalar fields only: 2 + 10 × (1 + 2 + 5 × 1).
    expect(
      requestedCost(
        `{ products(first: 10) { edges { node { title variants(first: 5) { edges { node { title } } } } } } }`
      )
    ).toBe(82)
    // `nodes` as `edges { node }`, `nodes(ids:)` once per id, a mutation ten, directives and aliases as nothing.
    expect(requestedCost(`{ orders(first: 4) { nodes { id customer { id } } } }`)).toBe(10)
    expect(requestedCost(`query($ids: [ID!]!) { nodes(ids: $ids) { id } }`, { ids: ["a", "b", "c"] })).toBe(5)
    expect(requestedCost(`mutation($k: String!) { refundCreate(input: {}) @idempotent(key: $k) { refund { id } } }`))
      .toBe(11)
    expect(requestedCost(`{ a: shop { name } b: shop { primaryDomain { url } } }`)).toBe(3)
  })

  it("holds every read of the mirror under Shopify's 1000 points, with room", () => {
    const costs = Object.fromEntries(Object.entries(mirrorQueries()).map(([name, q]) => [name, requestedCost(q)]))
    for (const [name, cost] of Object.entries(costs)) expect(cost, name).toBeLessThan(BUDGET)
    expect(costs).toMatchInlineSnapshot(`
      {
        "backfill.customers": 503,
        "backfill.orders": 869,
        "backfill.products": 703,
        "backfill.stock": 603,
        "changed.Customer": 503,
        "changed.Order": 869,
        "changed.Product": 703,
        "child.InventoryItem.inventoryLevels": 404,
        "child.Order.lineItems": 504,
        "child.Product.media": 204,
        "child.Product.variants": 204,
        "node": 506,
      }
    `)
  })

  it("holds every write and its reads under it too", () => {
    const costs = Object.fromEntries(Object.entries(writeQueries()).map(([name, q]) => [name, requestedCost(q, WORST)]))
    expect(Object.keys(costs).length).toBeGreaterThan(20)
    for (const [name, cost] of Object.entries(costs)) expect(cost, name).toBeLessThan(BUDGET)
    expect(costs).toMatchInlineSnapshot(`
      {
        "CODE_DISCOUNT_BY_CODE": 2,
        "CUSTOMER_CREATE": 12,
        "CUSTOMER_TAGS_ADD": 11,
        "CUSTOMER_TAGS_REMOVE": 11,
        "DISCOUNT_CODE_CREATE": 12,
        "DISCOUNT_CODE_DEACTIVATE": 12,
        "DRAFT_CREATE": 12,
        "DRAFT_DELETE": 11,
        "DRAFT_FIND": 27,
        "DRAFT_ORDER_COMPLETE": 13,
        "DRAFT_ORDER_CREATE": 12,
        "FULFILLMENT_CREATE": 12,
        "FULFILLMENT_ORDERS": 524,
        "FULFILLMENT_ORDER_LINES": 204,
        "GIFT_CARD_CREATE": 12,
        "ORDER_CANCEL": 12,
        "ORDER_UPDATE": 12,
        "PRODUCT_DELETE": 11,
        "PRODUCT_FIND": 5,
        "PRODUCT_SET": 16,
        "PRODUCT_UPDATE": 12,
        "REFUND_CREATE": 12,
        "RETURN_APPROVE": 12,
        "RETURN_DECLINE": 12,
        "SUGGESTED_REFUND": 6,
        "TAGS_ADD": 11,
        "TAGS_REMOVE": 11,
        "VARIANTS_UPDATE": 11,
      }
    `)
  })

  it("finds no query in the code over it, and none built from parts outside the mirror's builders", () => {
    const found = sourceQueries()
    expect(found.length).toBeGreaterThan(30)
    for (const { at, text } of found) {
      if (text.includes("${}")) {
        expect(at.startsWith(`${BUILT}:`), `${at} builds a query from parts: count it from its builder above`)
          .toBe(true)
        continue
      }
      expect(requestedCost(text, WORST), at).toBeLessThan(BUDGET)
    }
    expect(BUDGET).toBeLessThan(MAX_QUERY_COST)
  })
})
