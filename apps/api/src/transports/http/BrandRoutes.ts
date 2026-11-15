import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { FileStore } from "@insyte/modules/shared/domain/Documents"
import { waitUntil } from "cloudflare:workers"
import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `GET /api/brand/:workspace/logo/:file` (M17 step 20.1b): Huisstijl's logo, to anyone, as a shopper's mail and the
 * returns portal show it (`shared/domain/CustomerFacing.ts` writes the path). Any logo the workspace ever saved at
 * Huisstijl (`files.published_at`), so a mail sent before the logo was replaced keeps its image; one uploaded and never
 * saved, deleted, or refused by a scan is not found. Through the console's origin, like the portal. Shown as an image,
 * never run as a page (an SVG too), and cached a day: a new logo is a new file. The edge cache answers a repeat without
 * the database or R2, which a mail opened by many shoppers would otherwise cost each time.
 */

const ID = /^[a-z]+_[0-9a-z]{10,40}$/i

const notFound = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })

const HEADERS = {
  "cache-control": "public, max-age=86400",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "x-content-type-options": "nosniff"
}

/** The edge cache's key: the logo's own path, on a host of its own, whatever origin asked. */
const cacheKey = (workspace: string, file: string) =>
  new Request(`https://brand-logo.cache/api/brand/${workspace}/logo/${file}`)

export const BrandRoutes = HttpRouter.add(
  "GET",
  "/api/brand/:workspace/logo/:file",
  Effect.gen(function*() {
    const { workspace, file } = yield* HttpRouter.params
    if (workspace === undefined || file === undefined || !ID.test(workspace) || !ID.test(file)) return notFound
    const key = cacheKey(workspace, file)
    const cached = yield* Effect.promise(() => caches.default.match(key))
    if (cached !== undefined) return HttpServerResponse.fromWeb(cached)
    const db = yield* Db
    const [row] = yield* db.scopedFor((sql) =>
      sql<{ r2Key: string }>`
        select r2_key from files
        where id = ${file} and kind = 'logo' and deleted_at is null and published_at is not null
          and scan_state <> 'rejected'`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    if (row === undefined) return notFound
    const stored = yield* Effect.flatMap(Effect.service(FileStore), (s) => s.open(row.r2Key))
    if (stored === undefined) return notFound
    const bytes = yield* Effect.promise(() => new Response(stored.body).arrayBuffer())
    const headers = { ...HEADERS, "content-type": stored.mime, "content-length": String(bytes.byteLength) }
    waitUntil(caches.default.put(key, new Response(bytes, { headers })).catch(() => undefined))
    return HttpServerResponse.uint8Array(new Uint8Array(bytes), { contentType: stored.mime, headers: HEADERS })
  }).pipe(Effect.orDie, withRequestDb, Effect.withSpan("Brand.logoRoute"))
)
