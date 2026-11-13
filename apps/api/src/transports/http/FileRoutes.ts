import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { caseScope } from "@insyte/modules/chargebacks/use-cases/chargebacks"
import { CoursesService } from "@insyte/modules/courses/Courses"
import { cleanFileName, FileStore } from "@insyte/modules/shared/domain/Documents"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"

/*
 * `GET /api/files/:id` (M8.5): one of the workspace's files, for a signed-in member who may see what it belongs to (a
 * packing slip is an order's: Bestellingen at Bekijken; a return label a return's, M9.2: Retouren at Bekijken;
 * a chargeback's evidence the case's, M13: Chargebacks at Bekijken). Through the console's origin, like every route
 * of the session. A course's image (M17 step 4) goes to whoever may take the course or reads the catalogue. A
 * supplier statement's PDF (M13 step 6) is the supplier's: Leveranciers at Bekijken. An export (M14 step 5) is the
 * requester's own, for its seven days, with Data · Exporteren; it downloads as an attachment.
 */

/**
 * `inline` with the file's name twice (RFC 6266): a plain ASCII fallback without quotes, backslashes or control
 * characters, and the full name as RFC 5987 `filename*`. A name as typed can never break the header.
 */
const disposition = (name: string, as: "inline" | "attachment" = "inline") => {
  const clean = cleanFileName(name)
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_") || "bestand"
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${as}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

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
        sql<{ r2Key: string; name: string; mime: string; ownerType: string; ownerId: string | null }>`
          select r2_key, name, mime, owner_type, owner_id from files where id = ${id ?? ""} and deleted_at is null
            and owner_type in ('forwarding_item', 'return', 'quality_check', 'chargeback', 'brand', 'course', 'supplier_statement',
                               'export')`
      )
      if (row === undefined) return undefined
      if (row.ownerType === "course") {
        const courses = yield* CoursesService
        const may = yield* db.scoped((sql) => courses.mayReadFile(sql, row.ownerId ?? ""))
        return may ? row : undefined
      }
      // An export's file (M14 step 5) is the member's who asked for it, while it lasts, and only while they may export.
      if (row.ownerType === "export") {
        yield* Policy.require("data", 1)
        yield* Policy.requireAction("data.export")
        const principal = yield* CurrentPrincipal
        const [mine] = yield* db.scoped((sql) =>
          sql`select 1 from exports where id = ${row.ownerId} and requested_by = ${principal.id}
                and state = 'ready' and expires_at > now()`
        )
        return mine === undefined ? undefined : row
      }
      // What it belongs to decides who may have it: an order's slip at Bestellingen, a return's label at Retouren, a
      // supplier's quality photo at Producten (M9.4), a case's evidence at Chargebacks (M13).
      // …and the workspace's logo (Huisstijl, M17 step 20.1b) at Instellingen.
      yield* Policy.require(
        row.ownerType === "return"
          ? "returns"
          : row.ownerType === "quality_check"
          ? "products"
          : row.ownerType === "chargeback"
          ? "chargebacks"
          : row.ownerType === "brand"
          ? "settings"
          : row.ownerType === "supplier_statement"
          ? "suppliers"
          : "orders",
        1
      )
      // A case's evidence is as fenced as the case: a role or member held to other stores does not find it (M13).
      if (row.ownerType === "chargeback") {
        const [held] = yield* db.scoped((sql) =>
          Effect.flatMap(
            caseScope(sql),
            (scope) => sql`select 1 from chargebacks c where c.id = ${row.ownerId} and ${scope}`
          )
        )
        if (held === undefined) return undefined
      }
      return row
    }).pipe(
      Effect.provideService(CurrentPrincipal, active.principal),
      Effect.catchTag("Forbidden", () => Effect.void)
    )
    if (file === undefined) return notFound
    // Streamed from the bucket with its length, never held: an export can be tens of megabytes.
    const stored = yield* Effect.flatMap(Effect.service(FileStore), (s) => s.open(file.r2Key))
    if (stored === undefined) return notFound
    return HttpServerResponse.raw(stored.body, {
      contentType: stored.mime,
      contentLength: stored.size,
      headers: {
        "content-disposition": disposition(file.name, file.ownerType === "export" ? "attachment" : "inline"),
        "cache-control": "private, no-store",
        // An uploaded logo (an SVG, too) is shown as an image, never run as a page on the console's origin.
        ...(file.ownerType === "brand"
          ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
          : {}),
        "x-content-type-options": "nosniff"
      }
    })
  }).pipe(Effect.orDie, withRequestDb, Effect.withSpan("Files.downloadRoute"))
)
