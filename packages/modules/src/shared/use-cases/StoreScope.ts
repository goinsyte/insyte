import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { StoreChoice } from "../domain/Stores.ts"

/*
 * A principal's stores (domain.md §2.4): a role, a member or a key may reach some stores only. Every list over
 * store-owned rows (orders, products, customers) narrows to them, and to one store when the request names it.
 *
 * The fence is the principal's `storeScope`: the role's stores narrowed by the member's own (`members.stores`), or the
 * key's. The role's alone (`role.stores`) is wider for a member held to some stores, so it is never the fence.
 */

/**
 * Inside a read narrowed to one store (`inStore`): whether the principal, unnarrowed, reached every store. Rows of no
 * store (a ticket from mail, a case Shopify did not tie to a store) stay in view then, as they were before the
 * narrowing: narrowing to a store never hides a row of no store the principal already saw, nor shows one they did not.
 */
const StorelessInView = Context.Reference<boolean>("shared/StorelessInView", { defaultValue: () => false })

/**
 * Whether the principal sees the rows of no store that only someone reaching every store sees (`storeScope` null), as
 * they would unnarrowed: a feed line about a record whose store is gone, for one.
 */
export const seesStoreless = Effect.gen(function*() {
  const { storeScope } = yield* CurrentPrincipal
  return storeScope === null || (yield* StorelessInView)
})

/** The principal's stores, and the requested one, as a condition on `column` (trusted text from the slice). */
export const inScope = Effect.fn("StoreScope.inScope")(
  function*(sql: SqlClient.SqlClient, column: string, storeId?: string) {
    const { storeScope } = yield* CurrentPrincipal
    const storeless = storeScope !== null && (yield* StorelessInView)
    const parts = [
      storeScope === null
        ? sql`true`
        : storeScope.length === 0
        ? (storeless ? sql`${sql.literal(column)} is null` : sql`false`)
        : storeless
        ? sql`(${sql.literal(column)} is null or ${sql.literal(column)} = any(${[...storeScope]}))`
        : sql`${sql.literal(column)} = any(${[...storeScope]})`,
      storeId === undefined ? sql`true` : sql`${sql.literal(column)} = ${storeId}`
    ]
    return sql.and(parts)
  }
)

/**
 * As `inScope`, and a row of no store too: a queue row, a plate or a feed line that names no store is everyone's who
 * may open its area.
 */
export const inScopeOrNone = Effect.fn("StoreScope.inScopeOrNone")(
  function*(sql: SqlClient.SqlClient, column: string) {
    const scope = yield* inScope(sql, column)
    return sql`(${sql.literal(column)} is null or ${scope})`
  }
)

/**
 * The stores the principal reaches, as a store picker names them (the team's and the roles'), a disconnected one last:
 * nobody is offered a store they cannot open themselves.
 */
export const storeChoices = Effect.fn("StoreScope.storeChoices")(function*(sql: SqlClient.SqlClient) {
  const rows = yield* sql<{ id: string; name: string }>`
    select id, name from stores where ${yield* inScope(sql, "id")} order by status = 'disconnected', created_at, id`
  return rows.map((r) => new StoreChoice(r))
})

/**
 * A read narrowed to one store (the console's store switch, M6): the principal's `storeScope` narrowed to `storeId` for
 * every fence inside it, never widened. A store outside the principal's stores leaves none of their stores in scope,
 * so the read shows only its rows of no store (a stale choice reads as that, not an error). Rows of no store keep the
 * principal's own rule (`StorelessInView`): each store shows those every store shows, and store A's rows of a store and
 * store B's add up to every store's. No `storeId` is every store they reach.
 */
export const inStore =
  (storeId: string | undefined) => <A, E, R>(read: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | CurrentPrincipal> =>
    storeId === undefined ? read : Effect.gen(function*() {
      const principal = yield* CurrentPrincipal
      const storeless = principal.storeScope === null || (yield* StorelessInView)
      return yield* read.pipe(
        Effect.provideService(CurrentPrincipal, {
          ...principal,
          storeScope: principal.storeScope === null ? [storeId] : principal.storeScope.filter((s) => s === storeId)
        }),
        Effect.provideService(StorelessInView, storeless)
      )
    })
