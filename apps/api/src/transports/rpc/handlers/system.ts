import { Health, SystemRpcs } from "@insyte/api/rpc/SystemRpcs"
import { Db } from "@insyte/database/Db"
import { MIGRATIONS_TABLE } from "@insyte/database/Migrator"
import { Effect } from "effect"
import { AppInfo } from "../../../platform/Bindings.ts"

export const SystemHandlers = SystemRpcs.toLayer(Effect.gen(function*() {
  const info = yield* AppInfo
  return SystemRpcs.of({
    "System.health": Effect.fn("System.health")(function*() {
      const db = yield* Db
      return yield* db.routing((sql) =>
        sql<{ name: string; migrationId: number }>`
          select migration_id, name from ${sql(MIGRATIONS_TABLE)} order by migration_id desc limit 1`
      ).pipe(
        Effect.map(([row]) =>
          new Health({
            ...info,
            database: "ok",
            migratedTo: row === undefined ? "none" : `${String(row.migrationId).padStart(4, "0")}_${row.name}`
          })
        ),
        Effect.catchTag(
          "SqlError",
          (error) =>
            Effect.logError("System.health: the database did not answer", error).pipe(
              Effect.as(new Health({ ...info, database: "down", migratedTo: "" }))
            )
        )
      )
    })
  })
}))
