import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { ChargebacksService } from "@insyte/modules/chargebacks/Chargebacks"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"

/*
 * `PUT /api/chargebacks/:id/evidence` (M13 step 4): one file for a case's pack, uploaded before `Chargebacks.addEvidence`
 * puts it in. The body is the file, its name in `x-file-name`; the signed-in member needs Chargebacks · Bewerken. Through
 * the console's origin, like every route of the session. A declared size past ten megabytes is refused unread, and so
 * is a body without a declared size (a chunked one), so no body is ever read past the limit.
 */

const MAX_BYTES = 10 * 1024 * 1024

const refusal = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  HttpServerResponse.jsonUnsafe({ error: { code, ...extra } }, { status })

export const EvidenceRoutes = HttpRouter.add(
  "PUT",
  "/api/chargebacks/:id/evidence",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const { id } = yield* HttpRouter.params
    const headers = new Headers(request.headers as Record<string, string>)
    const declared = headers.get("content-length")
    if (declared === null || !/^\d+$/.test(declared)) return refusal(411, "length_required")
    if (Number(declared) > MAX_BYTES) return refusal(413, "too_large")
    const user = yield* userFrom(headers)
    if (Option.isNone(user)) return refusal(401, "unauthenticated")
    const [active] = yield* Effect.flatMap(Effect.service(Workspaces), (w) => w.memberships).pipe(
      Effect.provideService(CurrentUser, user.value),
      Effect.provide(Workspaces.layer)
    )
    if (active === undefined) return refusal(404, "not_found")
    const bytes = new Uint8Array(yield* Effect.orDie(request.arrayBuffer))
    if (bytes.byteLength > MAX_BYTES) return refusal(413, "too_large")
    const name = (() => {
      try {
        return decodeURIComponent(headers.get("x-file-name") ?? "")
      } catch {
        return ""
      }
    })()
    const chargebacks = yield* ChargebacksService
    return yield* chargebacks.upload({
      chargebackId: id ?? "",
      name,
      mime: headers.get("content-type") ?? "",
      bytes
    }).pipe(
      Effect.map((file) => HttpServerResponse.jsonUnsafe(file, { status: 201 })),
      Effect.provideService(CurrentUser, user.value),
      Effect.provideService(CurrentPrincipal, active.principal),
      Effect.catchTags({
        Forbidden: (e) => Effect.succeed(refusal(403, "forbidden", { permission: e.permission, level: e.level })),
        NotFound: () => Effect.succeed(refusal(404, "not_found")),
        CaseClosed: () => Effect.succeed(refusal(409, "case_closed")),
        Invalid: (e) =>
          Effect.succeed(
            e.fields["file"] === "type"
              ? refusal(415, "unsupported_type")
              : e.fields["file"] === "size"
              ? refusal(413, "too_large")
              : refusal(422, "invalid", { fields: e.fields })
          )
      })
    )
  }).pipe(Effect.orDie, withRequestDb, Effect.withSpan("Chargebacks.evidenceRoute"))
)
