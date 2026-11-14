import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { PendingEvents } from "../domain/Outbox.ts"
import * as Outbox from "./Outbox.ts"

/*
 * A variant's stock going down, for automations' "Lage voorraad" (M12 step 3). A writer of `inventory_levels` reads
 * the levels it is about to change (`levelsOf`), writes, and hands both to `dropped`, which writes `inventory.dropped`
 * for the variants that went down, summed over their locations of that source. Only in a workspace with such a flow
 * on: a sale lowers stock all day, and nothing else listens.
 */

/** Each variant's stock of one source, summed over its locations; a variant without a count is 0. */
export const levelsOf = (
  sql: SqlClient.SqlClient,
  variantIds: ReadonlyArray<string>,
  source: "shopify" | "supplier"
) =>
  variantIds.length === 0
    ? Effect.succeed(new Map<string, number>())
    : Effect.map(
      sql<{ variantId: string; available: number }>`
        select v.id as variant_id, coalesce(sum(i.available), 0)::int as available
        from variants v left join inventory_levels i on i.variant_id = v.id and i.source = ${source}
        where v.id in ${sql.in([...variantIds])}
        group by v.id`,
      (rows) => new Map(rows.map((r) => [r.variantId, r.available]))
    )

/** The variants of `before` that are lower now, as one event; nothing without a "Lage voorraad" flow on. */
export const dropped = Effect.fn("StockDrop.dropped")(function*(
  sql: SqlClient.SqlClient,
  workspaceId: string,
  before: ReadonlyMap<string, number>,
  source: "shopify" | "supplier"
) {
  if (before.size === 0) return
  const [flow] = yield* sql<{ id: string }>`
    select id from automations
    where trigger_variant = 'trigger.inventory_low' and status = 'active' and deleted_at is null and live_version > 0
    limit 1`
  if (flow === undefined) return
  const after = yield* levelsOf(sql, [...before.keys()], source)
  const levels = [...before].flatMap(([variantId, was]) => {
    const now = after.get(variantId)
    return now !== undefined && now < was ? [{ variantId, before: was, after: now }] : []
  })
  if (levels.length === 0) return
  const id = yield* Outbox.write(sql, workspaceId, { type: "inventory.dropped", workspaceId, levels })
  ;(yield* PendingEvents)?.add(id)
})
