import { Schema } from "effect"

/** Every store, or these. A member's stores narrow their role's, never widen them (06 §3.2). */
export const StoreAccess = Schema.Union([Schema.Literal("all"), Schema.Array(Schema.String)])
export type StoreAccess = typeof StoreAccess.Type

/** The stores both name: `b` narrows `a`, never widens it. */
export const narrowStores = (a: StoreAccess, b: StoreAccess): StoreAccess =>
  a === "all" ? b : b === "all" ? a : a.filter((s) => b.includes(s))

/**
 * Whether `stores` (a key's, an invitation's, a role's) lies inside `scope`, a principal's `storeScope` (`null` is every
 * store). Someone held to some stores never hands out more than they reach.
 */
export const withinScope = (stores: StoreAccess, scope: ReadonlyArray<string> | null): boolean =>
  scope === null || (stores !== "all" && stores.every((s) => scope.includes(s)))
