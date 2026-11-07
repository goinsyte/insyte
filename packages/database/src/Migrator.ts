import { Effect } from "effect"
import { Migrator, SqlClient } from "effect/sql"

/*
 * Runs the migration manifest as `insyte_owner` (06; M1.1). Keys are permanent: `0002_platform` stays `0002_platform`,
 * and a change is a new key (`scripts/migrations-check.ts`). The record lives in `migrations`, which `insyte_app` may
 * read (the health check names the last key) and not write.
 */

export const MIGRATIONS_TABLE = "migrations"

const run = Migrator.make({})

/** Applies every key not yet recorded, in order, and returns the ones it applied. */
export const migrate = (migrations: Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    // A migration that waits on a lock fails fast instead of queueing every query behind it.
    yield* sql`set lock_timeout = '5s'`
    yield* sql`set statement_timeout = '15min'`
    return yield* run({ loader: Migrator.fromRecord(migrations), table: MIGRATIONS_TABLE })
  })
