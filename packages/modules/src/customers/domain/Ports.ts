import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/**
 * A customer's newest Klaviyo sync (M7.5), for the line on their profile: the list it sent them to, and when. The
 * marketing slice keeps the syncs; this is what the customers slice asks of it, composed where the app is put together.
 */
export class KlaviyoSyncs extends Context.Service<KlaviyoSyncs, {
  readonly lastSyncOf: (
    sql: SqlClient.SqlClient,
    customerId: string
  ) => Effect.Effect<{ readonly list: string; readonly at: number } | null, SqlError.SqlError>
}>()("customers/KlaviyoSyncs") {}
