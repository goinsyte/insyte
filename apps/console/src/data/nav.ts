import { Atom } from "effect/reactivity"
import { CHARGEBACKS } from "./chargebacks.ts"
import { ConsoleClient } from "./client.ts"
import { CUSTOMERS } from "./customers.ts"
import { ORDERS } from "./orders.ts"
import { PRODUCTS } from "./products.ts"
import { QUALITY } from "./quality.ts"
import { RETURNS } from "./returns.ts"

/*
 * The area panel's counts (M5.3, ADR-0028) for the areas whose panel holds no list of its own: one `Nav.counts` read
 * per area, made only while one of its pages shows, and read again by the same keys as that area's list. Tickets and
 * the inbox keep their own (`data/tickets.ts`, `data/inbox.ts`).
 */

const KEYS: Record<string, ReadonlyArray<string>> = {
  orders: ORDERS,
  returns: RETURNS,
  customers: CUSTOMERS,
  // A product's Aandacht moves with its returns and its quality checks too.
  products: [...PRODUCTS, ...RETURNS, ...QUALITY],
  suppliers: [...PRODUCTS, ...RETURNS, ...QUALITY],
  chargebacks: CHARGEBACKS
}

/** The areas counted here. */
export const COUNTED_AREAS: ReadonlySet<string> = new Set(Object.keys(KEYS))

export const navCountsAtom = Atom.family((area: string) =>
  ConsoleClient.query("Nav.counts", { area }, { reactivityKeys: [...(KEYS[area] ?? [])] })
)
