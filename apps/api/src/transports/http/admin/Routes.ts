import { WorkspaceId } from "@insyte/domain/Ids"
import { PendingEvents, Relay } from "@insyte/modules/shared/domain/Outbox"
import { SESSION_MINUTES, StaffRefused } from "@insyte/modules/support/domain/Support"
import { Staff } from "@insyte/modules/support/Support"
import { Effect, Layer, Option, Schema, Scope } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { admitRequest, StaffIdentity } from "./Gate.ts"
import { CSP, PAGE, SCRIPT, STYLE } from "./Page.ts"
import { readability, readAs, rpcOf, STAFF_READS } from "./Reads.ts"

/*
 * The staff admin's routes (M18, Support), loaded by `../AdminRoutes.ts` on the first request under `/api/__admin`.
 * Every one sits behind the gate (`Gate.ts`: Cloudflare Access's JWT, then the staff allowlist), applied once to the
 * whole router below, so a route added here cannot forget it. A write (POST) also needs `x-insyte-staff`, which a
 * page on another site cannot send without asking first (no CORS here), so it cannot be made to act for the team.
 *
 *   GET  /api/__admin                         the staff page
 *   GET  /api/__admin/me                      who, and what may be read while looking along
 *   GET  /api/__admin/workspaces?q=           find a workspace
 *   GET  /api/__admin/workspaces/:id/health   its health
 *   POST /api/__admin/sessions                start looking along { workspaceId, reason }
 *   GET  /api/__admin/sessions/:id            a session of one's own
 *   POST /api/__admin/sessions/:id/read       one read { rpc, payload }
 *   POST /api/__admin/sessions/:id/end        end it
 *   GET  /api/__admin/audit?workspace=        the team's audit, newest first
 */

const STAFF_HEADER = "x-insyte-staff"

const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" }

const json = (body: unknown, status = 200) => HttpServerResponse.jsonUnsafe(body, { status, headers: NO_STORE })

const refused = (code: string) =>
  json({ error: { code } }, code === "no_session" || code === "workspace_not_found" ? 404 : 403)

const asset = (body: string, contentType: string) =>
  HttpServerResponse.text(body, {
    contentType,
    headers: { ...NO_STORE, "content-security-policy": CSP, "x-frame-options": "DENY" }
  })

const staffEmail = Effect.map(Effect.service(StaffIdentity), (s) => s.email)

const bodyOf = <S extends Schema.Top>(schema: S) =>
  Effect.flatMap(Effect.service(HttpServerRequest.HttpServerRequest), (request) => request.json).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.option
  )

/**
 * This request's connection, and the relay kicked once it answered (as `WithDbLive` does for the RPC): a session's
 * start and end reach the members' banner now, not at the next sweep.
 */
const withStaffDb = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.suspend(() => {
    const pending: Array<string> = []
    return withRequestDb(effect).pipe(
      Effect.provideService(PendingEvents, { add: (id) => void pending.push(id) }),
      Effect.ensuring(Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(pending)))
    )
  })

/** A use case of the support slice over this request's connection, its refusal as the staff page reads it. */
const serve = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withStaffDb(effect).pipe(
    Effect.map((value) => json(value)),
    Effect.catchIf(
      (error): error is StaffRefused & E => error instanceof StaffRefused,
      (error) => Effect.succeed(refused(error.code))
    )
  )

const Me = HttpRouter.add(
  "GET",
  "/api/__admin/me",
  Effect.map(staffEmail, (email) =>
    json({
      email,
      sessionMinutes: SESSION_MINUTES,
      reads: Object.entries(STAFF_READS).map(([rpc, label]) => ({ rpc, label }))
    }))
)

const Find = HttpRouter.add(
  "GET",
  "/api/__admin/workspaces",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const q = new URL(request.url, "http://local").searchParams.get("q") ?? ""
    const email = yield* staffEmail
    return yield* serve(Effect.map(Staff.find(email, q), (workspaces) => ({ workspaces })))
  })
)

const Health = HttpRouter.add(
  "GET",
  "/api/__admin/workspaces/:id/health",
  Effect.gen(function*() {
    const { id } = yield* HttpRouter.params
    const workspaceId = Schema.decodeUnknownOption(WorkspaceId)(id)
    if (Option.isNone(workspaceId)) return refused("workspace_not_found")
    return yield* serve(Staff.health(yield* staffEmail, workspaceId.value))
  })
)

const StartInput = Schema.Struct({ workspaceId: WorkspaceId, reason: Schema.String })

const Start = HttpRouter.add(
  "POST",
  "/api/__admin/sessions",
  Effect.gen(function*() {
    const input = yield* bodyOf(StartInput)
    if (Option.isNone(input)) return refused("reason_required")
    const email = yield* staffEmail
    return yield* serve(
      Effect.map(Staff.start(email, input.value.workspaceId, input.value.reason), (session) => ({ session }))
    )
  })
)

const Session = HttpRouter.add(
  "GET",
  "/api/__admin/sessions/:id",
  Effect.gen(function*() {
    const { id } = yield* HttpRouter.params
    return yield* serve(Effect.map(Staff.session(yield* staffEmail, id ?? ""), (session) => ({ session })))
  })
)

const ReadInput = Schema.Struct({
  rpc: Schema.String.check(Schema.isMaxLength(120)),
  payload: Schema.optional(Schema.Unknown)
})

const Read = HttpRouter.add(
  "POST",
  "/api/__admin/sessions/:id/read",
  Effect.gen(function*() {
    const { id } = yield* HttpRouter.params
    const sessionId = id ?? ""
    const email = yield* staffEmail
    const input = yield* bodyOf(ReadInput)
    if (Option.isNone(input)) return refused("invalid_payload")
    const tag = input.value.rpc
    const can = readability(tag)
    const rpc = can === "readable" ? rpcOf(tag) : undefined
    if (can !== "readable" || rpc === undefined) {
      const code = can === "never_for_staff" ? "never_for_staff" : "not_readable"
      return yield* serve(Staff.refuseRead(email, sessionId, tag, code))
    }
    return yield* withStaffDb(Effect.gen(function*() {
      const session = yield* Staff.beginRead(email, sessionId, tag, STAFF_READS[tag]!)
      const result = yield* readAs(session, rpc, input.value.payload)
      if (!result.ok) yield* Staff.failedRead(email, session, tag, result.code)
      return json(result)
    })).pipe(
      Effect.catchIf(
        (error): error is StaffRefused => error instanceof StaffRefused,
        (error) => Effect.succeed(refused(error.code))
      )
    )
  })
)

const End = HttpRouter.add(
  "POST",
  "/api/__admin/sessions/:id/end",
  Effect.gen(function*() {
    const { id } = yield* HttpRouter.params
    return yield* serve(Effect.map(Staff.end(yield* staffEmail, id ?? ""), (session) => ({ session })))
  })
)

const Trail = HttpRouter.add(
  "GET",
  "/api/__admin/audit",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const workspace = new URL(request.url, "http://local").searchParams.get("workspace")
    const email = yield* staffEmail
    return yield* serve(Effect.map(Staff.trail(email, workspace || null), (lines) => ({ lines })))
  })
)

const Assets = Layer.mergeAll(
  HttpRouter.add("GET", "/api/__admin", Effect.succeed(asset(PAGE, "text/html; charset=utf-8"))),
  HttpRouter.add("GET", "/api/__admin/staff.js", Effect.succeed(asset(SCRIPT, "text/javascript; charset=utf-8"))),
  HttpRouter.add("GET", "/api/__admin/staff.css", Effect.succeed(asset(STYLE, "text/css; charset=utf-8")))
)

const Routes = Layer.mergeAll(Assets, Me, Find, Health, Start, Session, Read, End, Trail)

/** The routes as one handler, built once per isolate when this module loads (as `dev/Routes.ts`). */
const router = Effect.runSync(
  HttpRouter.toHttpEffect(Routes).pipe(Effect.provideService(Scope.Scope, Scope.makeUnsafe()))
)

/** The gate, then the route: no route under the prefix answers anyone the gate did not admit. */
export const handler = Effect.gen(function*() {
  const admission = yield* admitRequest
  if (!admission.ok) {
    yield* Effect.logWarning("staff admin refused", { reason: admission.reason })
    return refused("forbidden")
  }
  const request = yield* HttpServerRequest.HttpServerRequest
  if (request.method !== "GET" && request.headers[STAFF_HEADER] !== "1") return refused("forbidden")
  return yield* router.pipe(Effect.provideService(StaffIdentity, { email: admission.email }))
})
