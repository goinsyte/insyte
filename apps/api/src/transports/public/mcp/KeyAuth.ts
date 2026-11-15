import type { CurrentApiKey } from "@insyte/api/http/Security"
import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest } from "effect/http"
import { KeyDoor, refusal } from "../KeyDoor.ts"
import { AgentDecisions, agentDecisions } from "./Reach.ts"

const bearer = (header: string | undefined) => {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "")
  return match?.[1] ?? ""
}

/**
 * The key door in front of the MCP route: a refusal is an HTTP 401, 403 or 429 before any JSON-RPC is read. Inside, the
 * request also has what the workspace's rules decide for an agent, read only if `tools/list` asks (`Reach.ts`).
 */
export const McpAuth = HttpRouter.middleware<{ provides: CurrentPrincipal | CurrentApiKey | Db | AgentDecisions }>()(
  Effect.map(
    Effect.service(KeyDoor),
    (door) => (effect) =>
      Effect.flatMap(
        HttpServerRequest.HttpServerRequest,
        (request) =>
          door.enter(
            bearer(request.headers["authorization"]),
            Effect.flatMap(agentDecisions, (decisions) => Effect.provideService(effect, AgentDecisions, decisions))
          ).pipe(
            Effect.catchTags({
              Refused: (e) => Effect.succeed(refusal(e)),
              Throttled: (e) => Effect.succeed(refusal(e)),
              UnknownVersion: (e) => Effect.succeed(refusal(e))
            })
          )
      )
  )
)
