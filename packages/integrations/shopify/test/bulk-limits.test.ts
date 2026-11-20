import { refusalMessage, ShopifyGraphql, ShopifyRefused } from "@insyte/modules/stores/domain/Ports"
import { queryOf, RESOURCES } from "@insyte/modules/stores/use-cases/backfill"
import { Cause, Effect, Exit, Redacted } from "effect"
import { describe, expect, it } from "vitest"
import { bulkQueryProblem, bulkShape } from "../src/BulkLimits.ts"
import { ShopifyGraphqlRecorded } from "../src/ShopifyRecorded.ts"

/*
 * Shopify's bulk query limits (five connections, two levels deep), which a real store enforces and the recorded twin
 * now does too: every query the backfill starts is within them, and one that is not is refused as Shopify refuses it.
 */

/** The products query as it was: the variants' stock per location a third connection deep. Shopify refused it. */
const NESTED_THREE_DEEP = `{
  products { edges { node {
    id variants { edges { node { id inventoryItem { id tracked
      inventoryLevels { edges { node { id quantities(names: ["available"]) { name quantity } } } } } } } }
    media { edges { node { ... on MediaImage { id image { url } } } } }
  } } }
}`

const start = (query: string) =>
  Effect.runPromiseExit(
    Effect.flatMap(Effect.service(ShopifyGraphql), (bulk) =>
      bulk.start("bulk-limits.myshopify.com", Redacted.make("recorded"), query)).pipe(
        Effect.provide(ShopifyGraphqlRecorded)
      )
  )

describe("Shopify's bulk query limits", () => {
  it("holds every query the backfill starts to them", () => {
    for (const resource of RESOURCES) {
      const query = queryOf(resource, "2024-11-20")
      expect(bulkQueryProblem(query), resource).toBeUndefined()
    }
    expect(bulkShape(queryOf("products", "2024-11-20"))).toEqual({ connections: 3, depth: 2 })
    expect(bulkShape(queryOf("stock", "2024-11-20"))).toEqual({ connections: 2, depth: 2 })
    expect(bulkShape(queryOf("customers", "2024-11-20"))).toEqual({ connections: 1, depth: 1 })
    // Fulfilments, refunds and transactions are lists, not connections.
    expect(bulkShape(queryOf("orders", "2024-11-20"))).toEqual({ connections: 2, depth: 2 })
  })

  it("finds a connection three deep, and a sixth connection", () => {
    expect(bulkShape(NESTED_THREE_DEEP)).toEqual({ connections: 4, depth: 3 })
    expect(bulkQueryProblem(NESTED_THREE_DEEP)).toMatch(/nested more than 2 levels/)
    const six = `{ orders { edges { node { id
      a: lineItems { edges { node { id } } } b: lineItems { nodes { id } } c: lineItems { edges { node { id } } }
      d: lineItems { edges { node { id } } } e: lineItems { edges { node { id } } } } } } }`
    expect(bulkShape(six)).toEqual({ connections: 6, depth: 2 })
    expect(bulkQueryProblem(six)).toMatch(/more than 5 connections/)
  })

  it("the recorded twin refuses a query past them as Shopify does, and takes the backfill's", async () => {
    const refused = await start(NESTED_THREE_DEEP)
    expect(Exit.isFailure(refused)).toBe(true)
    const error = Exit.isFailure(refused) ? Cause.findErrorOption(refused.cause) : undefined
    expect(error?._tag === "Some" ? error.value : undefined).toMatchObject({
      _tag: "ShopifyRefused",
      status: 200,
      reason: expect.stringMatching(/nested more than 2 levels/)
    })
    for (const resource of RESOURCES) {
      const started = await start(queryOf(resource, "2024-11-20"))
      expect(Exit.isSuccess(started), resource).toBe(true)
    }
  })

  it("says a refusal's status and reason, so a failed step says why", () => {
    const message = refusalMessage(
      new ShopifyRefused({
        status: 200,
        reason: "Bulk queries cannot contain connections nested more than 2 levels deep"
      })
    )
    expect(message).toBe(
      "Shopify refused (200): Bulk queries cannot contain connections nested more than 2 levels deep"
    )
    expect(refusalMessage(new ShopifyRefused({ status: 200, reason: "x".repeat(2000) }))).toHaveLength(500)
  })
})
