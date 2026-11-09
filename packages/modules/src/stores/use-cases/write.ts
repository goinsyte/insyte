import { Effect } from "effect"
import { ShopifyGraphql, type ShopifyRefused } from "../domain/Ports.ts"
import { throughGate } from "./backfill.ts"

/*
 * Writing to a store (M7): one Admin GraphQL mutation through the account's gate, answered with Shopify's user errors.
 * A user error, or a 4xx other than 401, is Shopify's answer about the record; anything else is worth another try.
 */

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
