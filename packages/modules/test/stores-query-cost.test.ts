import { describe, expect, it } from "vitest"
import {
  backfillChildQuery,
  backfillChildren,
  backfillQuery,
  type BackfillResource
} from "../src/stores/domain/Mirror.ts"

/*
 * Shopify refuses a query whose requested cost is over 1000 points before running it (MAX_COST_EXCEEDED), whatever the
 * bucket holds. Its documented rule, counted here: a scalar 0, an object 1, a connection (or a list taking `first`) 2
 * plus `first` times its node; nested connections multiply. Shopify now prices large connections below that (they
 * grow more slowly than `first`), so this is an upper bound: every page and follow-up the first import asks for is
 * held under 1000 by it.
 */

interface Field {
  readonly name: string
  readonly first: number | undefined
  readonly selection: ReadonlyArray<Field> | undefined
}

/** The selections of a query's text: fields with their `first` and sub-selection; fragments as `...`. */
const parse = (text: string): ReadonlyArray<Field> => {
  const tokens: ReadonlyArray<string> = text.match(/\.\.\.|[A-Za-z_$][\w$]*|\d+|[{}()]|"[^"]*"|\S/g) ?? []
  let at = tokens.indexOf("{")
  const selection = (): Array<Field> => {
    const fields: Array<Field> = []
    at++ // past "{"
    while (tokens[at] !== "}") {
      if (tokens[at] === "...") {
        at += 3 // `... on Type`
        fields.push({ name: "...", first: undefined, selection: selection() })
        continue
      }
      const name = tokens[at++]!
      let first: number | undefined
      if (tokens[at] === "(") {
        let depth = 0
        do {
          if (tokens[at] === "(") depth++
          if (tokens[at] === ")") depth--
          if (tokens[at] === "first" && tokens[at + 1] === ":") first = Number(tokens[at + 2])
          at++
        } while (depth > 0)
      }
      fields.push({ name, first, selection: tokens[at] === "{" ? selection() : undefined })
    }
    at++ // past "}"
    return fields
  }
  return selection()
}

const costOf = (fields: ReadonlyArray<Field>): number =>
  fields.reduce((sum, field) => {
    if (field.selection === undefined) return sum
    if (field.name === "...") return sum + costOf(field.selection)
    if (field.first === undefined) return sum + 1 + costOf(field.selection)
    const edges = field.selection.find((f) => f.name === "edges")
    const node = edges?.selection?.find((f) => f.name === "node")?.selection ?? field.selection
    const pageInfo = field.selection.some((f) => f.name === "pageInfo") ? 1 : 0
    return sum + 2 + pageInfo + field.first * (1 + costOf(node))
  }, 0)

/** The requested cost of a query's text, by Shopify's documented rule. */
const requestedCost = (query: string): number => costOf(parse(query))

const RESOURCES: ReadonlyArray<BackfillResource> = ["products", "stock", "customers", "orders"]

describe("what the first import asks Shopify for", () => {
  it("counts a query as Shopify's documented rule does", () => {
    // Ten products with five variants each, scalar fields only: 2 + 10 × (1 + 2 + 5 × 1).
    expect(
      requestedCost(
        `{ products(first: 10) { edges { node { title variants(first: 5) { edges { node { title } } } } } } }`
      )
    )
      .toBe(82)
  })

  it("stays under Shopify's 1000 points a query, for every page and every further page of a node's children", () => {
    const costs = Object.fromEntries(RESOURCES.flatMap((resource) => [
      [resource, requestedCost(backfillQuery(resource))],
      ...backfillChildren(resource).map((field) => [
        `${resource}.${field}`,
        requestedCost(backfillChildQuery(resource, field))
      ])
    ]))
    for (const [query, cost] of Object.entries(costs)) expect(cost, query).toBeLessThan(900)
    expect(costs).toMatchInlineSnapshot(`
      {
        "customers": 503,
        "orders": 869,
        "orders.lineItems": 504,
        "products": 703,
        "products.media": 204,
        "products.variants": 204,
        "stock": 603,
        "stock.inventoryLevels": 404,
      }
    `)
  })
})
