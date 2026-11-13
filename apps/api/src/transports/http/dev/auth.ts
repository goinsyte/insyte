import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AppInfo } from "../../../platform/Bindings.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"

/**
 * `GET /api/__dev/auth-events?email=<address>`: what `auth_events` holds for one account, oldest first, for the worker
 * tests and the e2e journey. Refused in production. `auth_events` shows a person only their own rows, so this reads as
 * that user, setting `app.user_id` in its transaction; `Db` gains a door for that with Settings → Beveiliging (M3).
 */
export const AuthEventsOf = HttpRouter.add(
  "GET",
  "/api/__dev/auth-events",
  Effect.gen(function*() {
    const { environment } = yield* AppInfo
    if (environment === "production") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const email = new URL(request.url, "http://local").searchParams.get("email")?.toLowerCase() ?? ""
    const db = yield* Db
    const events = yield* db.routing((sql) =>
      sql.withTransaction(Effect.gen(function*() {
        const users = yield* sql<{ id: string }>`select id from auth."user" where email = ${email}`
        const userId = users[0]?.id
        if (userId === undefined) return []
        yield* sql`select set_config('app.user_id', ${userId}, true)`
        return yield* sql<{ kind: string; country: string | null }>`
          select kind, country from auth_events order by at, id`
      }))
    )
    return HttpServerResponse.jsonUnsafe({ events })
  }).pipe(withRequestDb)
)
