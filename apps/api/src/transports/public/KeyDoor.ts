import { CurrentApiKey, RateLimited, Unauthorized } from "@insyte/api/http/PublicApi"
import { Connect } from "@insyte/database/Connect"
import type { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { ApiKeys } from "@insyte/modules/developer/ApiKeys"
import { Context, Effect, Layer } from "effect"
import { HttpServerRequest, type HttpServerResponse } from "effect/http"
import { RateLimits } from "../../platform/RateLimits.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * The one way a key comes in (M19.2, M19.3): the public API and the MCP server both pass every call through here. The
 * token becomes the key's principal on the request's own connection, the key's rate is taken, and once the response
 * is out the call lands in the key's request log.
 */

/** Calls per key per minute, REST and MCP together. */
const RATE = 600

type Served<E, R> = Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>

/** What the door provides to what it lets through. */
type Inside = CurrentPrincipal | CurrentApiKey | Db

export class KeyDoor extends Context.Service<KeyDoor, {
  /** `handler` as the key `token` names, or why not. */
  readonly enter: <E, R>(
    token: string,
    handler: Served<E, R>
  ) => Served<E | Unauthorized | RateLimited, Exclude<R, Inside> | HttpServerRequest.HttpServerRequest>
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
          const ip = request.headers["cf-connecting-ip"] ?? null
          const started = Date.now()
          const who = yield* keys.authenticate(token, ip).pipe(
            Effect.mapError((refused) => new Unauthorized({ reason: refused.reason }))
          )
          const { principal } = who
          const taken = yield* limits.take(`api-key:${principal.id}`, "v1", RATE, 60)
          if (!taken.ok) return yield* new RateLimited({ retryAfter: taken.retryAfterSeconds })
          const response = yield* handler.pipe(
            Effect.provideService(CurrentPrincipal, principal),
            Effect.provideService(CurrentApiKey, {
              id: principal.id,
              label: who.label,
              workspaceId: principal.workspaceId,
              workspaceName: who.workspaceName
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
          return response
        }).pipe(withRequestDb, Effect.provideService(Connect, connect))
      return KeyDoor.of({ enter: enter as KeyDoor["Service"]["enter"] })
    })
  ).pipe(Layer.provide(ApiKeys.layer))
}
