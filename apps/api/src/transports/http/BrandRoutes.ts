import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { FileStore } from "@insyte/modules/shared/domain/Documents"
import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `GET /api/brand/:workspace/logo/:file` (M17 step 20.1b): Huisstijl's logo, to anyone, as a shopper's mail and the
 * returns portal show it (`shared/domain/CustomerFacing.ts` writes the path). Only the logo the workspace has saved at
 * Huisstijl: one uploaded and not chosen, or replaced since, is not found. Through the console's origin, like the
 * portal. Shown as an image, never run as a page (an SVG too), and cached a day: a new logo is a new file.
 */

const ID = /^[a-z]+_[0-9a-z]{10,40}$/i

const notFound = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })

export const BrandRoutes = HttpRouter.add(
  "GET",
  "/api/brand/:workspace/logo/:file",
  Effect.gen(function*() {
    const { workspace, file } = yield* HttpRouter.params
    if (workspace === undefined || file === undefined || !ID.test(workspace) || !ID.test(file)) return notFound
    const db = yield* Db
    const [row] = yield* db.scopedFor((sql) =>
      sql<{ r2Key: string }>`
        select f.r2_key from files f
        where f.id = ${file} and f.kind = 'logo' and f.deleted_at is null
          and exists (select 1 from workspace_settings s where s.section = 'brand' and s.value ->> 'logoFileId' = f.id)`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    if (row === undefined) return notFound
    const stored = yield* Effect.flatMap(Effect.service(FileStore), (s) => s.open(row.r2Key))
    if (stored === undefined) return notFound
    return HttpServerResponse.raw(stored.body, {
      contentType: stored.mime,
      contentLength: stored.size,
      headers: {
        "cache-control": "public, max-age=86400",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "x-content-type-options": "nosniff"
      }
    })
  }).pipe(Effect.orDie, withRequestDb, Effect.withSpan("Brand.logoRoute"))
)
