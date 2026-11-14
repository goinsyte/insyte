import { ApiKeyAuth, CurrentApiKey } from "@insyte/api/http/Security"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Layer, Redacted } from "effect"
import { HttpServerResponse } from "effect/http"
import { KeyDoor, refusal } from "../KeyDoor.ts"

/*
 * An agent's key (ADR-0027) writes over MCP only, where each write tool goes through the workspace's autonomy rules
 * (`mcp/Governance.ts`: run and logged, a proposal a person files, or refused). `/v1` has no such decision, so an
 * agent's key reads there and every other method is refused before the endpoint runs, its body unread. Here, at the
 * door of the whole API, so an endpoint added later is covered without asking for it.
 */
const agentsRead = <E, R>(
  route: { readonly method: string; readonly path: string },
  handler: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
) =>
  route.method === "GET"
    ? handler
    : Effect.gen(function*() {
      const principal = yield* CurrentPrincipal
      if (principal.kind !== "agent") return yield* handler
      const key = yield* CurrentApiKey
      return HttpServerResponse.jsonUnsafe({
        error: {
          code: "ActionNotAllowedV1",
          message:
            "An agent's key only reads through /v1. Write through Insyte's MCP server, where the workspace's autonomy rules decide.",
          request_id: key.requestId,
          action: `${route.method} ${route.path}`,
          reason: "use_mcp"
        }
      }, { status: 403 })
    })

/** The key door in front of every `/v1` endpoint (M19.2): a refusal answers in the V1 envelope. */
export const ApiKeyAuthLive = Layer.effect(
  ApiKeyAuth,
  Effect.map(
    Effect.service(KeyDoor),
    (door) =>
      ApiKeyAuth.of({
        bearer: (handler, { credential, endpoint }) =>
          door.enter(Redacted.value(credential), agentsRead(endpoint, handler)).pipe(
            Effect.catchTags({
              Refused: (e) => Effect.succeed(refusal(e)),
              Throttled: (e) => Effect.succeed(refusal(e))
            })
          )
      })
  )
)
