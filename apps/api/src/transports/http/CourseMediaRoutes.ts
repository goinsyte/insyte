import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { CoursesService } from "@insyte/modules/courses/Courses"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"

/*
 * `PUT /api/courses/:courseId/media` (M17 step 4): one image for a course's image block, from the editor, for a
 * signed-in member at Cursussen · Bewerken. The body is the file, its name in `x-file-name`. Through the console's
 * origin, like every route of the session. The declared size is refused unread past two megabytes; the rest is the use
 * case's.
 */

const MAX_BYTES = 2 * 1024 * 1024

const refusal = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  HttpServerResponse.jsonUnsafe({ error: { code, ...extra } }, { status })

export const CourseMediaRoutes = HttpRouter.add(
  "PUT",
  "/api/courses/:courseId/media",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const { courseId } = yield* HttpRouter.params
    const headers = new Headers(request.headers as Record<string, string>)
    const user = yield* userFrom(headers)
    if (Option.isNone(user)) return refusal(401, "unauthenticated")
    if (Number(headers.get("content-length") ?? 0) > MAX_BYTES) return refusal(413, "too_large")
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
    const courses = yield* CoursesService
    return yield* courses.upload({ courseId: courseId ?? "", name, mime: headers.get("content-type") ?? "", bytes })
      .pipe(
        Effect.map(({ id }) => HttpServerResponse.jsonUnsafe({ id }, { status: 201 })),
        Effect.provideService(CurrentPrincipal, active.principal),
        Effect.catchTags({
          Forbidden: () => Effect.succeed(refusal(403, "forbidden")),
          NotFound: () => Effect.succeed(refusal(404, "not_found")),
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
  }).pipe(withRequestDb, Effect.withSpan("Courses.mediaRoute"))
)
