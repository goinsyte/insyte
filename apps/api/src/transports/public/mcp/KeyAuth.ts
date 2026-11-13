import type { CurrentApiKey } from "@insyte/api/http/Security"
import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest } from "effect/http"
import { KeyDoor, refusal } from "../KeyDoor.ts"

const bearer = (header: string | undefined) => {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "")
  return match?.[1] ?? ""
}

/** The key door in front of the MCP route: a refusal is an HTTP 401, 403 or 429 before any JSON-RPC is read. */
export const McpAuth = HttpRouter.middleware<{ provides: CurrentPrincipal | CurrentApiKey | Db }>()(
  Effect.map(
    Effect.service(KeyDoor),
    (door) => (effect) =>
      Effect.flatMap(
        HttpServerRequest.HttpServerRequest,
        (request) =>
          door.enter(bearer(request.headers["authorization"]), effect).pipe(
            Effect.catchTags({
              Refused: (e) => Effect.succeed(refusal(e)),
              Throttled: (e) => Effect.succeed(refusal(e))
            })
          )
      )
  )
)
