import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { DataOverview } from "../domain/Data.ts"

/*
 * `/data`'s counts in one read (M14 step 5; widgets/02 "/data"): the orders in the reader's stores (drafts aside), the
 * imported files and their rows, the stores that sync, and the external accounts by provider. Data · Bekijken.
 */
export const overview = Effect.fn("Data.overview")(function*() {
  yield* Policy.require("data", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const [orders] = yield* sql<{ n: number }>`
        select count(*)::int as n from orders o where not o.is_draft and ${scope}`
      const [imports] = yield* sql<{ files: number; rows: number }>`
        select count(*)::int as files, coalesce(sum(row_count), 0)::int as rows from imports
        where state = 'done' and deleted_at is null`
      const [stores] = yield* sql<{ connected: number; total: number }>`
        select count(*) filter (where status = 'connected')::int as connected,
               count(*)::int as total
        from stores`
      const connections = yield* sql<{ provider: string; status: string; lastSyncedAt: Date | null }>`
        select distinct on (provider) provider, status, last_synced_at from connections
        order by provider, (status = 'connected') desc, created_at desc`
      return new DataOverview({
        orders: orders?.n ?? 0,
        importedRows: imports?.rows ?? 0,
        imports: imports?.files ?? 0,
        stores: { connected: stores?.connected ?? 0, total: stores?.total ?? 0 },
        connections: connections.map((c) => ({
          provider: c.provider,
          status: c.status,
          lastSyncedAt: c.lastSyncedAt === null ? null : c.lastSyncedAt.getTime()
        }))
      })
    })
  )
})
