import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { StaffRefused } from "@insyte/modules/support/domain/Support"
import { Staff } from "@insyte/modules/support/Support"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { readAs, rpcOf } from "../admin/Reads.ts"
import { devOnly } from "./shared.ts"

/*
 * The staff admin's test doors (M18), only where nothing real lives (`devOnly`):
 *
 * - `POST /api/__dev/staff/unchecked-read` `{ staff, sessionId, rpc, payload }`: one console RPC through a live
 *   session of the team's, past the staff page's list of reads, so the worker tests prove the two locks under it on
 *   their own: `Policy` refuses `staff_viewer` every write, and the database's transaction is read-only. The session
 *   is still checked (the caller's, live, the consent on) and the read is written to both trails.
 * - `POST /api/__dev/staff/expired?staff=&workspace=`: a session begun as the team, whose hour is already past (the
 *   database lets no one move a session's hour: 0107), for its expiry. Answers its id.
 * - `POST /api/__dev/staff/age-consent?workspace=`: the owner's consent run out a minute ago.
 */

const notFound = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })

const Unchecked = Schema.Struct({
  staff: Schema.String,
  sessionId: Schema.String,
  rpc: Schema.String,
  payload: Schema.optional(Schema.Unknown)
})

const UncheckedRead = HttpRouter.add(
  "POST",
  "/api/__dev/staff/unchecked-read",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return notFound
    const request = yield* HttpServerRequest.HttpServerRequest
    const input = yield* request.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Unchecked)), Effect.option)
    if (Option.isNone(input)) return HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })
    const { staff, sessionId, rpc: tag, payload } = input.value
    const rpc = rpcOf(tag)
    if (rpc === undefined) return HttpServerResponse.jsonUnsafe({ error: { code: "not_readable" } }, { status: 400 })
    return yield* Effect.gen(function*() {
      const session = yield* Staff.beginRead(staff, sessionId, tag, tag)
      const result = yield* readAs(session, rpc, payload)
      if (!result.ok) yield* Staff.failedRead(staff, session, tag, result.code)
      return HttpServerResponse.jsonUnsafe(result.ok ? result : { ok: false, code: result.code })
    }).pipe(
      Effect.catchIf(
        (error): error is StaffRefused => error instanceof StaffRefused,
        (error) => Effect.succeed(HttpServerResponse.jsonUnsafe({ error: { code: error.code } }, { status: 403 }))
      ),
      Effect.orDie,
      withRequestDb
    )
  })
)

const ExpiredSession = HttpRouter.add(
  "POST",
  "/api/__dev/staff/expired",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return notFound
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = new URL(request.url, "http://local").searchParams
    const staff = query.get("staff") ?? ""
    const db = yield* Db
    const id = mintId("sts")
    yield* db.recordAsStaff(staff, (query.get("workspace") ?? "") as WorkspaceId)((sql) =>
      sql`insert into staff_sessions (id, workspace_id, staff_email, reason, started_at, expires_at)
          values (${id}, ${query.get("workspace") ?? ""}, ${staff}, 'Verlopen',
                  now() - interval '2 hours', now() - interval '1 hour')`
    )
    return HttpServerResponse.jsonUnsafe({ id })
  }).pipe(Effect.orDie, withRequestDb)
)

const ConsentAge = HttpRouter.add(
  "POST",
  "/api/__dev/staff/age-consent",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return notFound
    const request = yield* HttpServerRequest.HttpServerRequest
    const workspace = (new URL(request.url, "http://local").searchParams.get("workspace") ?? "") as WorkspaceId
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      sql`update workspaces set support_access_until = now() - interval '1 minute'
          where id = ${workspace} and support_access_until is not null`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ aged: true })
  }).pipe(Effect.orDie, withRequestDb)
)

export const StaffRoutes = Layer.mergeAll(UncheckedRead, ExpiredSession, ConsentAge)
