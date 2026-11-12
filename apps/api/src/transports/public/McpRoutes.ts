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
      get_order_tracking: ({ order_id }) => read.tracking(order_id),
      list_suppliers: () => read.suppliers,
      list_forwarding: ({ view }) => read.legs(view),
      forward_orders: ({ idempotency_key, ...body }) => kicking(read.forwardLegs(body, idempotency_key)),
      reroute_leg: ({ leg_id, idempotency_key, supplier_id }) =>
        read.rerouteLeg(leg_id, { supplier_id }, idempotency_key),
      list_queue: ({ tab }) => read.queue(tab),
      get_proposal: ({ proposal_id }) => read.proposal(proposal_id),
      file_proposal: ({ proposal_id, idempotency_key }) => kicking(read.fileProposal(proposal_id, idempotency_key)),
      list_returns: ({ status }) => read.returns(status),
      get_return: ({ return_id }) => read.returnOne(return_id),
      start_return: ({ idempotency_key, ...body }) => kicking(read.startReturn(body, idempotency_key)),
      approve_return: ({ return_id, idempotency_key, keep_item }) =>
        kicking(read.moveReturn(return_id, { kind: "approve", keep_item }, idempotency_key)),
      reject_return: ({ return_id, idempotency_key, reason }) =>
        kicking(read.moveReturn(return_id, { kind: "reject", reason }, idempotency_key)),
      send_return_label: ({ return_id, idempotency_key }) => kicking(read.labelReturn(return_id, idempotency_key)),
      add_return_tracking: ({ return_id, idempotency_key, carrier, tracking }) =>
        read.trackReturn(return_id, { carrier, tracking }, idempotency_key),
      receive_return: ({ return_id, idempotency_key }) =>
        kicking(read.moveReturn(return_id, { kind: "receive" }, idempotency_key)),
      inspect_return: ({ return_id, idempotency_key, lines }) =>
        kicking(read.moveReturn(return_id, { kind: "inspect", lines }, idempotency_key)),
      resolve_return: ({ return_id, idempotency_key, resolution }) =>
        kicking(read.resolveReturn(return_id, { resolution }, idempotency_key)),
      list_tickets: ({ view }) => read.tickets(view),
      get_ticket: ({ ticket_id }) => read.ticket(ticket_id),
      create_ticket: ({ idempotency_key, ...body }) => read.createTicket(body, idempotency_key),
      update_ticket: ({ ticket_id, idempotency_key, ...body }) => read.updateTicket(ticket_id, body, idempotency_key),
      set_ticket_status: ({ ticket_id, idempotency_key, status }) =>
        read.moveTicket(ticket_id, status, idempotency_key),
      assign_ticket: ({ ticket_id, idempotency_key, member_id, unassign }) =>
        read.assignTicket(ticket_id, member_id, unassign !== true, idempotency_key),
      comment_on_ticket: ({ ticket_id, idempotency_key, ...body }) =>
        read.commentTicket(ticket_id, body, idempotency_key),
      get_costs: ({ from, to }) => read.costs(from, to),
      get_cost_figures: ({ months }) => read.costFigures(months)
    }
  })))
)

export const McpRoutes = McpServer.layerHttpRequestScoped({
  name: "Insyte",
  version: "1.0.0",
  instructions:
    "Insyte for dropshipping operators. Read the workspace's team and roles, and its orders, products, customers and suppliers; tag orders, note them, change their address, cancel and refund them; forward paid orders to their suppliers and move them to another supplier; start, approve, reject, label, receive, inspect and settle returns; write, change, move, assign and comment on tickets; read the costs and the months' net profit, with the key's scopes. Cancelling, refunding, forwarding and settling a return with a refund cannot be undone: confirm them with the person first.",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28],
  registrations: Tools
}).pipe(Layer.provide(McpAuth.layer))
