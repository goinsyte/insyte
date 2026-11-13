import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * A principal's stores (domain.md §2.4): a role, a member or a key may reach some stores only. Every list over
 * store-owned rows (orders, products, customers) narrows to them, and to one store when the request names it.
 *
 * The fence is the principal's `storeScope`: the role's stores narrowed by the member's own (`members.stores`), or the
 * key's. The role's alone (`role.stores`) is wider for a member held to some stores, so it is never the fence.
 */

/** The principal's stores, and the requested one, as a condition on `column` (trusted text from the slice). */
export const inScope = Effect.fn("StoreScope.inScope")(
  function*(sql: SqlClient.SqlClient, column: string, storeId?: string) {
    const { storeScope } = yield* CurrentPrincipal
    const parts = [
      storeScope === null ? sql`true` : sql`${sql.literal(column)} = any(${[...storeScope]})`,
      storeId === undefined ? sql`true` : sql`${sql.literal(column)} = ${storeId}`
    ]
    return sql.and(parts)
  }
)
