import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * A role's stores (domain.md §2.4): a role, or a key, may reach some stores only. Every list over store-owned rows
 * (orders, products, customers) narrows to them, and to one store when the request names it.
 */

/** The principal's stores, and the requested one, as a condition on `column` (trusted text from the slice). */
export const inScope = Effect.fn("StoreScope.inScope")(
  function*(sql: SqlClient.SqlClient, column: string, storeId?: string) {
    const { role } = yield* CurrentPrincipal
    const parts = [
      role.stores === "all" ? sql`true` : sql`${sql.literal(column)} = any(${[...role.stores]})`,
      storeId === undefined ? sql`true` : sql`${sql.literal(column)} = ${storeId}`
    ]
    return sql.and(parts)
  }
)
