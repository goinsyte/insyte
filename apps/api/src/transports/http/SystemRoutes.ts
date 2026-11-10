import { Db } from "@insyte/database/Db"
import { MIGRATIONS_TABLE } from "@insyte/database/Migrator"
import { Config, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { AppInfo } from "../../platform/Bindings.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/** `GET /api/health`: what runs where, and whether the database answers. Read by the deploy smoke test and uptime. */
const Health = HttpRouter.add(
  "GET",
  "/api/health",
  Effect.gen(function*() {
    const { environment, version } = yield* AppInfo
    const db = yield* Effect.flatMap(Effect.service(Db), (db) => db.routing((sql) => sql`select 1`)).pipe(
      Effect.as("ok" as const),
      Effect.catchTag(
        "SqlError",
        (error) => Effect.logError("health: the database did not answer", error).pipe(Effect.as("down" as const))
      )
    )
    return HttpServerResponse.jsonUnsafe({ version, environment, db }, { status: db === "ok" ? 200 : 503 })
  }).pipe(withRequestDb)
)

/**
 * `GET /api/health/deep`: proof that the Worker connects as `insyte_app`, which cannot bypass row level security, and
 * which migration the database is at. Behind Access in every deployed environment (`/api/__dev/*` and this path).
 */
const DeepHealth = HttpRouter.add(
  "GET",
  "/api/health/deep",
  Effect.gen(function*() {
    const db = yield* Db
    const [row] = yield* db.routing((sql) =>
      sql<{ role: string; bypassesRls: boolean; migratedTo: string | null }>`
        select current_user as role,
               (select rolbypassrls from pg_roles where rolname = current_user) as bypasses_rls,
               (select lpad(migration_id::text, 4, '0') || '_' || name from ${sql(MIGRATIONS_TABLE)}
                 order by migration_id desc limit 1) as migrated_to`
    )
    const ok = row?.role === "insyte_app" && row.bypassesRls === false
    return HttpServerResponse.jsonUnsafe({ ok, ...row }, { status: ok ? 200 : 500 })
  }).pipe(
    Effect.catchTag("SqlError", (error) =>
      Effect.logError("deep health: the database did not answer", error).pipe(
        Effect.as(HttpServerResponse.jsonUnsafe({ ok: false, db: "down" }, { status: 503 }))
      )),
    withRequestDb
  )
)

/** `GET /api/config`: the public settings a client needs before it signs in. Never a secret. */
const PublicConfig = HttpRouter.add(
  "GET",
  "/api/config",
  Effect.gen(function*() {
    const turnstileSiteKey = yield* Config.String("TURNSTILE_SITE_KEY").pipe(Config.withDefault(""))
    const sentryDsn = yield* Config.String("SENTRY_DSN").pipe(Config.withDefault(""))
    // Offered only with both halves of the OAuth client, as better-auth configures it (`BetterAuth`).
    const google = (yield* Config.String("GOOGLE_CLIENT_ID").pipe(Config.withDefault(""))) !== "" &&
      Option.isSome(yield* Config.Redacted("GOOGLE_CLIENT_SECRET").pipe(Config.option))
    return HttpServerResponse.jsonUnsafe({
      turnstileSiteKey,
      sentryDsn,
      signInProviders: google ? ["password", "google"] : ["password"],
      flags: {}
    })
  })
)

export const SystemRoutes = Layer.mergeAll(Health, DeepHealth, PublicConfig)
