import { Effect } from "effect"
import { ConnectionGate, ShopifyGraphql, type ShopifyRefused } from "./Ports.ts"

/*
 * How a slice calls a store's Shopify (M6.3, M7): every call goes through the account's gate (`ConnectionGate`) for its
 * token and its share of the bucket, and tells the gate what Shopify said the bucket holds now. A write is one Admin
 * GraphQL mutation answered with Shopify's user errors; a user error, or a 4xx other than 401, is Shopify's answer about
 * the record, anything else is worth another try. Only the ports: no tables, no other slice.
 */

/** One call through the gate: a token, the bucket's go-ahead, and what Shopify said the bucket holds now. */
export const throughGate = <A extends { readonly throttle: unknown }, E, R>(
  ctx: { readonly connectionId: string },
  cost: number,
  call: (token: Parameters<ShopifyGraphql["Service"]["start"]>[1]) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function*() {
    const gate = yield* ConnectionGate
    const token = yield* gate.accessToken(ctx.connectionId)
    yield* gate.reserve(ctx.connectionId, cost)
    const result = yield* call(token)
    const throttle = result.throttle as Parameters<ConnectionGate["Service"]["observe"]>[1] | null
    if (throttle !== null) yield* gate.observe(ctx.connectionId, throttle)
    return result
  })

type Errors = ReadonlyArray<{ readonly message: string }>

const errorsAt = (data: unknown, root: string, field = "userErrors"): Errors =>
  ((data as Record<string, Record<string, unknown> | null> | null)?.[root]?.[field] as Errors | undefined) ?? []

/** One mutation (or read) through the gate: what Shopify answered, and its user errors under `root`. */
export const mutate = (
  target: { readonly connectionId: string; readonly shop: string },
  query: string,
  variables: Record<string, unknown>,
  root: string,
  field?: string
) =>
  Effect.flatMap(Effect.service(ShopifyGraphql), (graphql) =>
    Effect.map(
      throughGate(target, 10, (token) => graphql.query(target.shop, token, query, variables)),
      ({ data }) => ({ data, errors: errorsAt(data, root, field) })
    ))

/** A refusal that is Shopify's answer about the record, not a reason to try again. */
export const isAnswer = (error: ShopifyRefused) => error.status >= 400 && error.status < 500 && error.status !== 401
