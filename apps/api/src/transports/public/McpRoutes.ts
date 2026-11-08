import type { CurrentApiKey } from "@insyte/api/http/PublicApi"
import { InsyteTools } from "@insyte/api/mcp/McpTools"
import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Layer } from "effect"
import { McpProtocol, McpServer } from "effect/ai"
import { HttpRouter, HttpServerRequest } from "effect/http"
import { KeyDoor, refusal } from "./KeyDoor.ts"
import { Resources } from "./Resources.ts"

/*
 * The MCP server (M19.3) at `/mcp`: Streamable HTTP, one server per request (a Worker keeps nothing between them), the
 * sessionless protocol 2026-07-28. A client logs in as an API key does, with `Authorization: Bearer ins_live_…`, and
 * acts with the key's scopes; each call lands in the key's request log.
 */

const bearer = (header: string | undefined) => {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "")
  return match?.[1] ?? ""
}

/** The key door in front of the MCP route: a refusal is an HTTP 401, 403 or 429 before any JSON-RPC is read. */
const McpAuth = HttpRouter.middleware<{ provides: CurrentPrincipal | CurrentApiKey | Db }>()(
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

const Tools = McpServer.toolkit(InsyteTools).pipe(
  Layer.provide(InsyteTools.toLayer(Effect.map(Effect.service(Resources), (read) => ({
    whoami: () => read.me,
    list_members: () => read.members,
    list_roles: () => read.roles,
    list_orders: (query) => read.orders(query),
    list_products: (query) => read.products(query),
    list_customers: (query) => read.customers(query)
  }))))
)

export const McpRoutes = McpServer.layerHttpRequestScoped({
  name: "Insyte",
  version: "1.0.0",
  instructions:
    "Insyte for dropshipping operators. Read the workspace's team and roles, and its orders, products and customers, with the key's scopes.",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28],
  registrations: Tools
}).pipe(Layer.provide(McpAuth.layer))
