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
 * A turned-away request's body is never read: cancelled, so the client's upload stops and the runtime holds nothing
 * open for it (W13.6). Best-effort: a body already gone, or none, is nothing to cancel.
 */
const letGo = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.flatMap(
    Effect.option(HttpServerRequest.toWeb(request)),
    (web) =>
      web._tag === "Some" && web.value.body !== null && !web.value.bodyUsed
        ? Effect.promise(() => web.value.body!.cancel().catch(() => undefined))
        : Effect.void
  )

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
              Refused: (e) => Effect.as(letGo(request), refusal(e)),
              Throttled: (e) => Effect.as(letGo(request), refusal(e)),
              UnknownVersion: (e) => Effect.as(letGo(request), refusal(e))
            })
          )
      )
  )
)
