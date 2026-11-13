import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { DataService } from "@insyte/modules/data/Data"
import { MAX_IMPORT_BYTES } from "@insyte/modules/data/domain/Data"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"

/*
 * `PUT /api/data/imports` (M14 step 5): a CSV for the Data hub, uploaded before `Data.imports.upload` makes it an
 * import. The body is the file, its name in `x-file-name`; the signed-in member needs Data · Importeren (level 2).
 * Through the console's origin, like every route of the session. A declared size past ten megabytes is refused unread,
 * and so is a body without a declared size, so no body is ever read past the limit.
 */

const refusal = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  HttpServerResponse.jsonUnsafe({ error: { code, ...extra } }, { status })

export const DataImportRoutes = HttpRouter.add(
  "PUT",
  "/api/data/imports",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const headers = new Headers(request.headers as Record<string, string>)
    const declared = headers.get("content-length")
    if (declared === null || !/^\d+$/.test(declared)) return refusal(411, "length_required")
    if (Number(declared) > MAX_IMPORT_BYTES) return refusal(413, "too_large")
    const user = yield* userFrom(headers)
    if (Option.isNone(user)) return refusal(401, "unauthenticated")
    const [active] = yield* Effect.flatMap(Effect.service(Workspaces), (w) => w.memberships).pipe(
      Effect.provideService(CurrentUser, user.value),
      Effect.provide(Workspaces.layer)
    )
    if (active === undefined) return refusal(404, "not_found")
    const bytes = new Uint8Array(yield* Effect.orDie(request.arrayBuffer))
    if (bytes.byteLength > MAX_IMPORT_BYTES) return refusal(413, "too_large")
    const name = (() => {
      try {
        return decodeURIComponent(headers.get("x-file-name") ?? "")
      } catch {
        return ""
      }
    })()
    const data = yield* DataService
    return yield* data.storeUpload({ name, mime: headers.get("content-type") ?? "", bytes }).pipe(
      Effect.map((file) => HttpServerResponse.jsonUnsafe(file, { status: 201 })),
      Effect.provideService(CurrentUser, user.value),
      Effect.provideService(CurrentPrincipal, active.principal),
      Effect.catchTags({
        Forbidden: (e) => Effect.succeed(refusal(403, "forbidden", { permission: e.permission, level: e.level })),
        Invalid: (e) =>
          Effect.succeed(
            e.fields["file"] === "type"
              ? refusal(415, "not_csv")
              : e.fields["file"] === "size"
              ? refusal(413, "too_large")
              : refusal(422, "invalid", { fields: e.fields })
          )
      })
    )
  }).pipe(Effect.orDie, withRequestDb, Effect.withSpan("Data.importUploadRoute"))
)
