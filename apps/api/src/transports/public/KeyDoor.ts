import { CurrentApiKey } from "@insyte/api/http/Security"
import { Connect } from "@insyte/database/Connect"
import type { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { WEBHOOK_API_VERSIONS } from "@insyte/domain/Webhooks"
import { ApiKeys } from "@insyte/modules/developer/ApiKeys"
import { Context, Data, Effect, Layer, Option } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { RateLimits } from "../../platform/RateLimits.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * The one way a key comes in (M19.2, M19.3): the public API and the MCP server both pass every call through here. The
 * token becomes the key's principal on the request's own connection, the key's rate is taken (api.md §6: 120 a
 * minute, 10 a second, REST and MCP together), every answer carries `Insyte-Request-Id` (the trace id, as every
 * response does) and `Insyte-Version`, and once it is out the call lands in the key's request log.
 *
 * `Insyte-Version` (ADR-0024, api.md §6) names the dated version a call is answered in, one of the versions webhook
 * endpoints offer; without it, the key's own: the newest on or before the day it was made. Every version answers the
 * same shapes so far, so the header is checked and answered, and a version that does not exist is refused.
 */

const REQUEST_ID = "insyte-request-id"
const VERSION = "insyte-version"

/** The version a key made at `at` answers in: the newest dated on or before it, or the first there was. */
export const versionAt = (at: Date): string => {
  const day = at.toISOString().slice(0, 10)
  return WEBHOOK_API_VERSIONS.find((v) => v <= day) ?? WEBHOOK_API_VERSIONS[WEBHOOK_API_VERSIONS.length - 1]!
}

/** The token was turned away; `reason` as `KeyRefused` has it. */
export class Refused extends Data.TaggedError("Refused")<{ readonly reason: string; readonly requestId: string }> {}

/** A call that names an `Insyte-Version` there is none of. */
export class UnknownVersion extends Data.TaggedError("UnknownVersion")<{
  readonly version: string
  readonly requestId: string
}> {}

/** Over the key's rate. */
export class Throttled extends Data.TaggedError("Throttled")<{
  readonly retryAfter: number
  readonly requestId: string
}> {}

type Served<E, R> = Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>

/** What the door provides to what it lets through. */
type Inside = CurrentPrincipal | CurrentApiKey | Db

export class KeyDoor extends Context.Service<KeyDoor, {
  /** `handler` as the key `token` names, or why not. */
  readonly enter: <E, R>(
    token: string,
    handler: Served<E, R>
  ) => Served<E | Refused | Throttled | UnknownVersion, Exclude<R, Inside> | HttpServerRequest.HttpServerRequest>
}>()("api-worker/KeyDoor") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      const keys = yield* ApiKeys
      const limits = yield* RateLimits
      const connect = yield* Connect
      const enter = <E, R>(token: string, handler: Served<E, R>) =>
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          // The trace id, as `RequestContext` sets the header from it: the same string in the body and in Sentry.
          const requestId = Option.match(yield* Effect.option(Effect.currentSpan), {
            onNone: () => crypto.randomUUID().replaceAll("-", ""),
            onSome: (span) => span.traceId
          })
          const ip = request.headers["cf-connecting-ip"] ?? null
          const started = Date.now()
          const who = yield* keys.authenticate(token, ip).pipe(
            Effect.mapError((refused) => new Refused({ reason: refused.reason, requestId }))
          )
          const { principal } = who
          const bucket = `api-key:${principal.id}`
          const [minute, second] = yield* Effect.all([
            limits.take(bucket, "minute", 120, 60),
            limits.take(bucket, "second", 10, 1)
          ], { concurrency: "unbounded" })
          if (!minute.ok || !second.ok) {
            return yield* new Throttled({
              retryAfter: Math.max(minute.retryAfterSeconds, second.retryAfterSeconds, 1),
              requestId
            })
          }
          const asked = request.headers[VERSION]?.trim()
          if (asked !== undefined && asked !== "" && !(WEBHOOK_API_VERSIONS as ReadonlyArray<string>).includes(asked)) {
            return yield* new UnknownVersion({ version: asked, requestId })
          }
          const version = asked === undefined || asked === "" ? versionAt(who.createdAt) : asked
          const response = yield* handler.pipe(
            Effect.provideService(CurrentPrincipal, principal),
            Effect.provideService(CurrentApiKey, {
              id: principal.id,
              label: who.label,
              workspaceId: principal.workspaceId,
              workspaceName: who.workspaceName,
              requestId
            })
          )
          yield* keys.logRequest(principal.workspaceId, {
            keyId: principal.id,
            method: request.method,
            path: new URL(request.url, "http://api").pathname,
            status: response.status,
            ms: Date.now() - started,
            ip
          })
          return HttpServerResponse.setHeaders(response, { [REQUEST_ID]: requestId, [VERSION]: version })
        }).pipe(withRequestDb, Effect.provideService(Connect, connect))
      return KeyDoor.of({ enter: enter as KeyDoor["Service"]["enter"] })
    })
  ).pipe(Layer.provide(ApiKeys.layer))
}

/** A refusal as the V1 envelope (api.md §6), with the request's id in the body and the header. */
export const refusal = (error: Refused | Throttled | UnknownVersion): HttpServerResponse.HttpServerResponse => {
  const headers = { [REQUEST_ID]: error.requestId }
  if (error._tag === "UnknownVersion") {
    return HttpServerResponse.jsonUnsafe({
      error: {
        code: "InvalidRequestV1",
        message: `There is no API version ${error.version}. Send one of ${WEBHOOK_API_VERSIONS.join(", ")}, or none.`,
        request_id: error.requestId,
        field: VERSION
      }
    }, { status: 400, headers })
  }
  if (error._tag === "Throttled") {
    return HttpServerResponse.jsonUnsafe({
      error: {
        code: "RateLimitedV1",
        message: `Too many requests for this key. Retry after ${error.retryAfter} s.`,
        request_id: error.requestId,
        retry_after: error.retryAfter
      }
    }, { status: 429, headers: { ...headers, "retry-after": String(error.retryAfter) } })
  }
  if (error.reason === "ip") {
    return HttpServerResponse.jsonUnsafe({
      error: {
        code: "IpNotAllowedV1",
        message: "This key does not accept calls from this address.",
        request_id: error.requestId
      }
    }, { status: 403, headers })
  }
  return HttpServerResponse.jsonUnsafe({
    error: {
      code: "UnauthorizedV1",
      message: error.reason === "missing"
        ? "Send an API key as Authorization: Bearer ins_live_…"
        : `The API key is ${error.reason === "unknown" ? "not valid" : error.reason}.`,
      request_id: error.requestId,
      reason: error.reason
    }
  }, { status: 401, headers: { ...headers, "www-authenticate": "Bearer realm=\"insyte\"" } })
}
