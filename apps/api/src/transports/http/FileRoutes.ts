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
 * packing slip is an order's: Bestellingen at Bekijken; a return label a return's, M9.2: Retouren at Bekijken;
 * a chargeback's evidence the case's, M13: Chargebacks at Bekijken). Through
 * the console's origin, like every route of the session.
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
      const [row] = yield* db.scoped((sql) =>
        sql<{ r2Key: string; name: string; mime: string; ownerType: string }>`
          select r2_key, name, mime, owner_type from files where id = ${id ?? ""} and deleted_at is null
            and owner_type in ('forwarding_item', 'return', 'quality_check', 'chargeback')`
      )
      if (row === undefined) return undefined
      // What it belongs to decides who may have it: an order's slip at Bestellingen, a return's label at Retouren, a
      // supplier's quality photo at Producten (M9.4), a case's evidence at Chargebacks (M13).
      yield* Policy.require(
        row.ownerType === "return"
          ? "returns"
          : row.ownerType === "quality_check"
          ? "products"
          : row.ownerType === "chargeback"
          ? "chargebacks"
          : "orders",
        1
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
