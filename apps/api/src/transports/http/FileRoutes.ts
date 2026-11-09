import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { FileStore } from "@insyte/modules/shared/domain/Documents"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"

/*
 * `GET /api/files/:id` (M8.5): one of the workspace's files, for a signed-in member who may see what it belongs to (a
 * packing slip is an order's: Bestellingen at Bekijken). Through the console's origin, like every route of the session.
 */

const notFound = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })

export const FileRoutes = HttpRouter.add(
  "GET",
  "/api/files/:id",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const { id } = yield* HttpRouter.params
    const user = yield* userFrom(new Headers(request.headers as Record<string, string>))
    if (Option.isNone(user)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "unauthenticated" } }, { status: 401 })
    }
    const [active] = yield* Effect.flatMap(Effect.service(Workspaces), (w) => w.memberships).pipe(
      Effect.provideService(CurrentUser, user.value),
      Effect.provide(Workspaces.layer)
    )
    if (active === undefined) return notFound
    const db = yield* Db
    const file = yield* Effect.gen(function*() {
      yield* Policy.require("orders", 1)
      const [row] = yield* db.scoped((sql) =>
        sql<{ r2Key: string; name: string; mime: string }>`
          select r2_key, name, mime from files where id = ${id ?? ""} and deleted_at is null
            and owner_type = 'forwarding_item'`
      )
      return row
    }).pipe(
      Effect.provideService(CurrentPrincipal, active.principal),
      Effect.catchTag("Forbidden", () => Effect.void)
    )
    if (file === undefined) return notFound
    const stored = yield* Effect.flatMap(Effect.service(FileStore), (s) => s.get(file.r2Key))
    if (stored === undefined) return notFound
    return HttpServerResponse.uint8Array(stored.bytes, {
      contentType: stored.mime,
      headers: { "content-disposition": `inline; filename="${file.name}"`, "cache-control": "private, no-store" }
    })
  }).pipe(Effect.orDie, withRequestDb, Effect.withSpan("Files.downloadRoute"))
)
