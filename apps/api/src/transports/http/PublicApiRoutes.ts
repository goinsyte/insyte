import {
  ApiKeyAuth,
  CurrentApiKey,
  InsufficientScope,
  PublicApi,
  RateLimited,
  Unauthorized
} from "@insyte/api/http/PublicApi"
import { Connect } from "@insyte/database/Connect"
import type { Forbidden } from "@insyte/domain/Errors"
import { scopesOf } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { ApiKeys } from "@insyte/modules/developer/ApiKeys"
import { Members } from "@insyte/modules/members/Members"
import { RolesService } from "@insyte/modules/roles/RolesService"
import { Effect, Layer, Redacted } from "effect"
import { HttpServerRequest } from "effect/http"
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api"
import { RateLimits } from "../../platform/RateLimits.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * The public API's server half (M19.2): the bearer key's principal for every endpoint, its rate and its request log,
 * and the handlers over the same use cases the console calls. OpenAPI at `/v1/openapi.json`, its reference at
 * `/v1/docs`.
 */

/** Calls per key per minute. */
const RATE = 600

const ACCESS = ["none", "read", "write", "manage"] as const

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

/** The use case's refusal as the scope the key misses. */
const scope = (e: Forbidden) => new InsufficientScope({ scope: `${e.permission}.${e.level >= 2 ? "write" : "read"}` })

const ApiKeyAuthLive = Layer.effect(
  ApiKeyAuth,
  Effect.gen(function*() {
    const keys = yield* ApiKeys
    const limits = yield* RateLimits
    const connect = yield* Connect
    return ApiKeyAuth.of({
      bearer: (handler, { credential }) =>
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const ip = request.headers["cf-connecting-ip"] ?? null
          const started = Date.now()
          const who = yield* keys.authenticate(Redacted.value(credential), ip).pipe(
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
    })
  })
)

const KeyLive = HttpApiBuilder.group(
  PublicApi,
  "key",
  (handlers) =>
    handlers.handle("me", () =>
      Effect.gen(function*() {
        const key = yield* CurrentApiKey
        const { role } = yield* CurrentPrincipal
        return {
          key: { id: key.id, label: key.label, scopes: scopesOf(role.levels as Record<string, 0 | 1 | 2>) },
          workspace: { id: key.workspaceId, name: key.workspaceName }
        }
      }))
)

const TeamLive = HttpApiBuilder.group(PublicApi, "team", (handlers) =>
  Effect.gen(function*() {
    const members = yield* Members
    const roles = yield* RolesService
    return handlers
      .handle("members", () =>
        members.get.pipe(
          Effect.map((team) => ({
            data: team.members.map((m) => ({
              id: m.id,
              name: m.name,
              email: m.email,
              role: { id: m.roleId, label: m.roleLabel },
              status: m.deactivated ? "deactivated" as const : "active" as const,
              joinedAt: iso(m.joinedAt)!,
              lastActiveAt: iso(m.lastActiveAt)
            }))
          })),
          Effect.catchTag("Forbidden", (e) => Effect.fail(scope(e)))
        ))
      .handle("roles", () =>
        roles.list.pipe(
          Effect.map((list) => ({
            data: list.roles.map((r) => ({
              id: r.id,
              label: r.label,
              system: r.system,
              access: Object.fromEntries(Object.entries(r.levels).map(([area, level]) => [area, ACCESS[level]!]))
            }))
          })),
          Effect.catchTag("Forbidden", (e) => Effect.fail(scope(e)))
        ))
  }))

/** The routes, with what they read: the slices' services and the key's door. */
export const PublicApiRoutes = Layer.mergeAll(
  HttpApiBuilder.layer(PublicApi, { openapiPath: "/v1/openapi.json" }),
  HttpApiScalar.layerCdn(PublicApi, { path: "/v1/docs" })
).pipe(
  Layer.provide(Layer.mergeAll(KeyLive, TeamLive)),
  Layer.provide(ApiKeyAuthLive),
  Layer.provide(Layer.mergeAll(Members.layer, RolesService.layer, ApiKeys.layer))
)
