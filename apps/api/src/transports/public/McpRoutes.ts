import type { CurrentApiKey } from "@insyte/api/http/PublicApi"
import { InsyteTools } from "@insyte/api/mcp/McpTools"
import type { Db } from "@insyte/database/Db"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Relay } from "@insyte/modules/shared/domain/Outbox"
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

// The order commands also tell the outbox: the relay is the Worker's, taken once when the toolkit is built.
const Tools = McpServer.toolkit(InsyteTools).pipe(
  Layer.provide(InsyteTools.toLayer(Effect.gen(function*() {
    const read = yield* Resources
    const relay = yield* Relay
    const kicking = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provideService(effect, Relay, relay)
    return {
      whoami: () => read.me,
      list_members: () => read.members,
      list_roles: () => read.roles,
      list_orders: (query) => read.orders(query),
      list_products: (query) => read.products(query),
      list_customers: (query) => read.customers(query),
      get_order: ({ order_id }) => read.order(order_id),
      tag_order: ({ order_id, idempotency_key, ...body }) => kicking(read.tagOrder(order_id, body, idempotency_key)),
      set_order_note: ({ order_id, idempotency_key, body }) =>
        kicking(read.noteOrder(order_id, { body }, idempotency_key)),
      update_shipping_address: ({ order_id, idempotency_key, ...address }) =>
        kicking(read.shipOrderTo(order_id, address, idempotency_key)),
      cancel_order: ({ order_id, idempotency_key, ...body }) =>
        kicking(read.cancelOrder(order_id, body, idempotency_key)),
      refund_order: ({ order_id, idempotency_key, ...body }) =>
        kicking(read.refundOrder(order_id, body, idempotency_key)),
      list_suppliers: () => read.suppliers,
      list_forwarding: ({ view }) => read.legs(view),
      forward_orders: ({ idempotency_key, ...body }) => kicking(read.forwardLegs(body, idempotency_key)),
      reroute_leg: ({ leg_id, idempotency_key, supplier_id }) =>
        read.rerouteLeg(leg_id, { supplier_id }, idempotency_key)
    }
  })))
)

export const McpRoutes = McpServer.layerHttpRequestScoped({
  name: "Insyte",
  version: "1.0.0",
  instructions:
    "Insyte for dropshipping operators. Read the workspace's team and roles, and its orders, products, customers and suppliers; tag orders, note them, change their address, cancel and refund them; forward paid orders to their suppliers and move them to another supplier, with the key's scopes. Cancelling, refunding and forwarding cannot be undone: confirm them with the person first.",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28],
  registrations: Tools
}).pipe(Layer.provide(McpAuth.layer))
