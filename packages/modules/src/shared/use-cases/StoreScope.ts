import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { StoreChoice } from "../domain/Stores.ts"

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
