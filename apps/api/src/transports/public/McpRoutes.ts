import { CurrentApiKey } from "@insyte/api/http/PublicApi"
import { InsyteTools } from "@insyte/api/mcp/McpTools"
import type { Db } from "@insyte/database/Db"
import type { AgentActionId } from "@insyte/domain/AgentActions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { govern } from "@insyte/modules/agent/Agent"
import { ActionNotAllowed, type AgentEffect } from "@insyte/modules/agent/domain/AgentLog"
import type { ProposalAction } from "@insyte/modules/proposals/domain/Proposals"
import { Relay } from "@insyte/modules/shared/domain/Outbox"
import { Effect, Layer } from "effect"
import { McpProtocol, McpServer } from "effect/ai"
import { HttpRouter, HttpServerRequest } from "effect/http"
import { SqlError } from "effect/sql"
import { KeyDoor, refusal } from "./KeyDoor.ts"
import { Resources } from "./Resources.ts"

/*
 * The MCP server (M19.3) at `/mcp`: Streamable HTTP, one server per request (a Worker keeps nothing between them), the
 * sessionless protocol 2026-07-28. A client logs in as an API key does, with `Authorization: Bearer ins_live_…`, and
 * acts with the key's scopes; each call lands in the key's request log. An agent's key (M15 step 6) writes only within
 * the workspace's autonomy rules: Zelf doen runs and is logged with its way back, Eerst vragen becomes a proposal a
 * person files, Nooit refuses.
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

const STATUS: Record<string, string> = {
  intake: "Nieuw",
  in_progress: "Bezig",
  awaiting_reply: "Wacht op antwoord",
  done: "Klaar"
}
const PRIORITY: Record<string, string> = { low: "Laag", medium: "Normaal", high: "Hoog" }

const euro = (minor: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(minor / 100)

/** What a write tool needs to go through the autonomy rules, read before it runs (as the agent, with its scopes). */
interface Plan<A> {
  readonly action: AgentActionId
  readonly amountMinor?: number
  readonly storeId?: string | null
  readonly subject: { readonly type: string; readonly id: string; readonly label: string } | null
  readonly sentence: string
  readonly before?: string | null
  readonly after?: string | null
  readonly ask: ProposalAction | null
  /** What it changed, from what it answered, for the way back after the window. */
  readonly effect: (value: A) => AgentEffect
}

const message = (reason: string | null) =>
  reason === "locked"
    ? "This action always asks first: a person files the proposal in Insyte."
    : "The workspace asks first for this action: a person files the proposal in Insyte."

/**
 * A write tool for an agent's key (M15 step 6, ADR-0027): planned, then run, proposed or refused as the workspace's
 * autonomy rules say, and logged. Any other key runs the tool as before, with nothing read first.
 */
const governed = <A, E, R, E2, R2>(
  tool: string,
  key: string | undefined,
  plan: Effect.Effect<Plan<A>, E2, R2>,
  run: Effect.Effect<A, E, R>
) =>
  Effect.gen(function*() {
    const principal = yield* CurrentPrincipal
    if (principal.kind !== "agent") return yield* run
    const apiKey = yield* CurrentApiKey
    const p = yield* plan
    const outcome = yield* govern({
      action: p.action,
      amountMinor: p.amountMinor ?? null,
      storeId: p.storeId ?? null,
      subject: p.subject,
      sentence: p.sentence,
      reason: `Gevraagd via MCP met de sleutel ${apiKey.label}.`,
      before: p.before ?? null,
      after: p.after ?? null,
      ask: p.ask,
      trigger: { kind: "mcp", label: `Via MCP · ${apiKey.label}` },
      dedupeKey: key === undefined ? null : `mcp:${apiKey.id}:${tool}:${key}`,
      run: Effect.map(run, (value) => ({ value, effect: p.effect(value) }))
    }).pipe(
      Effect.catchIf(SqlError.isSqlError, Effect.die),
      Effect.catchIf(
        (e): e is ActionNotAllowed => e instanceof ActionNotAllowed,
        (e) =>
          Effect.fail({
            error: {
              code: "ActionNotAllowedV1" as const,
              message: e.reason === "unknown"
                ? "This action is outside what an agent may do in Insyte."
                : "The workspace does not allow an agent to do this (Nooit).",
              request_id: apiKey.requestId,
              action: e.action,
              reason: e.reason
            }
          })
      )
    )
    if (outcome._tag === "Ran") return outcome.value
    return {
      object: "agent_proposal" as const,
      proposal_id: outcome.proposalId,
      agent_action_id: outcome.agentActionId,
      reason: outcome.reason,
      message: message(outcome.reason)
    }
  })

const token = (): AgentEffect => ({ kind: "token" })

/** A filed plate's action, as the catalogue action it is. */
const FILED: Record<string, AgentActionId> = {
  approve_return: "ApproveReturn",
  approve_quality_check: "RequestQualityCheck",
  notify_delayed_order: "SendReply",
  create_supplier_ticket: "MessageSupplier",
  cancel_order: "CancelOrder",
  refund_order: "RefundOrder",
  resolve_return: "RefundOrder",
  forward_orders: "ForwardOrder",
  send_return_label: "SendReturnLabel",
  tag_order: "ApplyLabel",
  set_order_note: "AddNote",
  create_ticket: "CreateTicket",
  update_ticket: "SetPriority",
  set_ticket_status: "SetTicketStatus",
  assign_ticket: "AssignTicket",
  comment_on_ticket: "AddNote"
}

// The order commands also tell the outbox: the relay is the Worker's, taken once when the toolkit is built.
const Tools = McpServer.toolkit(InsyteTools).pipe(
  Layer.provide(InsyteTools.toLayer(Effect.gen(function*() {
    const read = yield* Resources
    const relay = yield* Relay
    const kicking = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provideService(effect, Relay, relay)
    const orderSubject = (id: string) =>
      Effect.map(read.order(id), (o) => ({
        order: o,
        subject: { type: "order", id: o.id, label: o.number },
        storeId: o.store_id
      }))
    const ticketSubject = (id: string) =>
      Effect.map(read.ticket(id), (t) => ({
        ticket: { ...t, number: `#${t.number}` },
        subject: { type: "ticket", id: t.id, label: `#${t.number}` }
      }))
    const returnSubject = (id: string) =>
      Effect.map(read.returnOne(id), (r) => ({
        record: r,
        subject: { type: "return", id: r.id, label: r.number },
        storeId: r.store_id
      }))
    return {
      whoami: () => read.me,
      list_members: () => read.members,
      list_roles: () => read.roles,
      list_orders: (query) => read.orders(query),
      list_products: (query) => read.products(query),
      list_customers: (query) => read.customers(query),
      get_order: ({ order_id }) => read.order(order_id),
      tag_order: ({ order_id, idempotency_key, ...body }) =>
        governed(
          "tag_order",
          idempotency_key,
          Effect.map(orderSubject(order_id), ({ order, subject, storeId }): Plan<unknown> => {
            const add = (body.add ?? []).filter((t) => !order.tags.includes(t))
            const remove = (body.remove ?? []).filter((t) => order.tags.includes(t))
            return {
              action: "ApplyLabel",
              storeId,
              subject,
              sentence: `Labels van bestelling ${order.number} aangepast`,
              before: order.tags.join(", ") || "Geen labels",
              after: order.tags.filter((t) => !remove.includes(t)).concat(add).join(", ") || "Geen labels",
              ask: { _tag: "TagOrder", orderId: order_id, add: body.add ?? [], remove: body.remove ?? [] },
              effect: () => ({ kind: "order.tags", orderId: order_id, add, remove })
            }
          }),
          kicking(read.tagOrder(order_id, body, idempotency_key))
        ),
      set_order_note: ({ order_id, idempotency_key, body }) =>
        governed(
          "set_order_note",
          idempotency_key,
          Effect.map(orderSubject(order_id), ({ order, subject, storeId }): Plan<unknown> => ({
            action: "AddNote",
            storeId,
            subject,
            sentence: body.trim() === ""
              ? `Interne notitie van bestelling ${order.number} gewist`
              : `Interne notitie bij bestelling ${order.number} gezet`,
            before: order.internal_note,
            after: body,
            ask: { _tag: "SetOrderNote", orderId: order_id, body },
            effect: () => ({ kind: "order.note", orderId: order_id, before: order.internal_note ?? "" })
          })),
          kicking(read.noteOrder(order_id, { body }, idempotency_key))
        ),
      update_shipping_address: ({ order_id, idempotency_key, ...address }) =>
        kicking(read.shipOrderTo(order_id, address, idempotency_key)),
      cancel_order: ({ order_id, idempotency_key, ...body }) =>
        governed(
          "cancel_order",
          idempotency_key,
          Effect.map(orderSubject(order_id), ({ order, subject, storeId }): Plan<unknown> => ({
            action: "CancelOrder",
            storeId,
            subject,
            sentence: `Bestelling ${order.number} geannuleerd`,
            before: order.status,
            after: "Geannuleerd",
            ask: { _tag: "CancelOrder", orderId: order_id, restock: body.restock, notify: body.notify_customer },
            effect: token
          })),
          kicking(read.cancelOrder(order_id, body, idempotency_key))
        ),
      refund_order: ({ order_id, idempotency_key, ...body }) =>
        governed(
          "refund_order",
          idempotency_key,
          Effect.map(orderSubject(order_id), ({ order, subject, storeId }): Plan<unknown> => ({
            action: "RefundOrder",
            amountMinor: body.amount_minor,
            storeId,
            subject,
            sentence: `${euro(body.amount_minor)} terugbetaald op bestelling ${order.number}`,
            after: euro(body.amount_minor),
            ask: { _tag: "RefundOrder", orderId: order_id, amountMinor: body.amount_minor, note: body.note ?? null },
            effect: token
          })),
          kicking(read.refundOrder(order_id, body, idempotency_key))
        ),
      get_order_tracking: ({ order_id }) => read.tracking(order_id),
      list_suppliers: () => read.suppliers,
      list_forwarding: ({ view }) => read.legs(view),
      forward_orders: ({ idempotency_key, ...body }) =>
        governed(
          "forward_orders",
          idempotency_key,
          Effect.succeed<Plan<unknown>>({
            action: "ForwardOrder",
            subject: body.leg_ids[0] === undefined
              ? null
              : {
                type: "forwarding_leg",
                id: body.leg_ids[0],
                label: body.leg_ids.length === 1 ? "1 doorsturing" : `${body.leg_ids.length} doorsturingen`
              },
            sentence: body.leg_ids.length === 1
              ? "Bestelling doorgestuurd naar de leverancier"
              : `${body.leg_ids.length} bestellingen doorgestuurd naar hun leveranciers`,
            ask: { _tag: "ForwardOrder", legIds: body.leg_ids, note: body.note ?? null },
            effect: token
          }),
          kicking(read.forwardLegs(body, idempotency_key))
        ),
      reroute_leg: ({ leg_id, idempotency_key, supplier_id }) =>
        read.rerouteLeg(leg_id, { supplier_id }, idempotency_key),
      list_queue: ({ tab }) => read.queue(tab),
      get_proposal: ({ proposal_id }) => read.proposal(proposal_id),
      file_proposal: ({ proposal_id, idempotency_key }) =>
        governed(
          "file_proposal",
          idempotency_key,
          Effect.map(read.proposal(proposal_id), (prop): Plan<unknown> => ({
            action: FILED[prop.action.kind] ?? ("Unknown" as AgentActionId),
            storeId: prop.store,
            subject: { type: prop.subject_type, id: prop.subject_id, label: prop.number },
            sentence: `Voorstel ${prop.number} uitgevoerd: ${prop.heading}`,
            // A proposal is a person's to file; an agent files one only where it may do the action itself.
            ask: null,
            effect: token
          })),
          kicking(read.fileProposal(proposal_id, idempotency_key))
        ),
      list_returns: ({ status }) => read.returns(status),
      get_return: ({ return_id }) => read.returnOne(return_id),
      start_return: ({ idempotency_key, ...body }) => kicking(read.startReturn(body, idempotency_key)),
      approve_return: ({ return_id, idempotency_key, keep_item }) =>
        governed(
          "approve_return",
          idempotency_key,
          Effect.map(returnSubject(return_id), ({ record, subject, storeId }): Plan<unknown> => ({
            action: "ApproveReturn",
            storeId,
            subject,
            sentence: `Retour ${record.number} goedgekeurd`,
            ask: {
              _tag: "ApproveReturn",
              returnId: return_id,
              ...(keep_item === undefined ? {} : { keepItem: keep_item })
            },
            effect: token
          })),
          kicking(read.moveReturn(return_id, { kind: "approve", keep_item }, idempotency_key))
        ),
      reject_return: ({ return_id, idempotency_key, reason }) =>
        kicking(read.moveReturn(return_id, { kind: "reject", reason }, idempotency_key)),
      send_return_label: ({ return_id, idempotency_key }) =>
        governed(
          "send_return_label",
          idempotency_key,
          Effect.map(returnSubject(return_id), ({ record, subject, storeId }): Plan<unknown> => ({
            action: "SendReturnLabel",
            storeId,
            subject,
            sentence: `Retourlabel voor ${record.number} verstuurd`,
            ask: { _tag: "SendReturnLabel", returnId: return_id },
            effect: token
          })),
          kicking(read.labelReturn(return_id, idempotency_key))
        ),
      add_return_tracking: ({ return_id, idempotency_key, carrier, tracking }) =>
        read.trackReturn(return_id, { carrier, tracking }, idempotency_key),
      receive_return: ({ return_id, idempotency_key }) =>
        kicking(read.moveReturn(return_id, { kind: "receive" }, idempotency_key)),
      inspect_return: ({ return_id, idempotency_key, lines }) =>
        kicking(read.moveReturn(return_id, { kind: "inspect", lines }, idempotency_key)),
      resolve_return: ({ return_id, idempotency_key, resolution }) =>
        governed(
          "resolve_return",
          idempotency_key,
          Effect.map(returnSubject(return_id), ({ record, subject, storeId }): Plan<unknown> => ({
            // Settling with money is a refund; the other settlements change nothing outside Insyte yet.
            action: resolution === "refund" ? "RefundOrder" : "ApproveReturn",
            storeId,
            subject,
            sentence: `Retour ${record.number} afgehandeld`,
            ask: { _tag: "ResolveReturn", returnId: return_id, resolution },
            effect: token
          })),
          kicking(read.resolveReturn(return_id, { resolution }, idempotency_key))
        ),
      list_tickets: ({ view }) => read.tickets(view),
      get_ticket: ({ ticket_id }) => read.ticket(ticket_id),
      create_ticket: ({ idempotency_key, ...body }) =>
        governed(
          "create_ticket",
          idempotency_key,
          Effect.succeed<Plan<unknown>>({
            action: "CreateTicket",
            subject: body.order_id !== undefined
              ? { type: "order", id: body.order_id, label: body.title }
              : body.customer_id !== undefined
              ? { type: "customer", id: body.customer_id, label: body.title }
              : { type: "ticket", id: `new:${body.title}`, label: body.title },
            sentence: `Ticket aangemaakt: ${body.title}`,
            after: body.title,
            ask: {
              _tag: "CreateTicket",
              title: body.title,
              ...(body.description === undefined ? {} : { description: body.description }),
              ...(body.status === undefined ? {} : { status: body.status }),
              ...(body.priority === undefined ? {} : { priority: body.priority }),
              ...(body.assignee_ids === undefined ? {} : { assigneeIds: body.assignee_ids }),
              ...(body.labels === undefined ? {} : { labels: body.labels }),
              ...(body.order_id === undefined ? {} : { related: { type: "order" as const, id: body.order_id } }),
              ...(body.customer_id === undefined
                ? {}
                : { related: { type: "customer" as const, id: body.customer_id } })
            },
            effect: (value) => ({ kind: "ticket.create", ticketId: (value as { readonly id: string }).id })
          }),
          read.createTicket(body, idempotency_key)
        ),
      update_ticket: ({ ticket_id, idempotency_key, ...body }) =>
        governed(
          "update_ticket",
          idempotency_key,
          Effect.map(ticketSubject(ticket_id), ({ ticket, subject }): Plan<unknown> => {
            const priority = body.priority !== undefined && body.priority !== ticket.priority ? body.priority : null
            return {
              // Its priority is what the catalogue names; the rest of a ticket's fields go with it.
              action: priority !== null || body.labels === undefined ? "SetPriority" : "ApplyLabel",
              subject,
              sentence: priority !== null
                ? `Prioriteit van ${ticket.number} op ${PRIORITY[priority] ?? priority} gezet`
                : `Ticket ${ticket.number} bijgewerkt`,
              before: priority !== null ? PRIORITY[ticket.priority] ?? ticket.priority : null,
              after: priority !== null ? PRIORITY[priority] ?? priority : null,
              ask: {
                _tag: "UpdateTicket",
                ticketId: ticket_id,
                ...(body.title === undefined ? {} : { title: body.title }),
                ...(body.description === undefined ? {} : { description: body.description }),
                ...(body.priority === undefined ? {} : { priority: body.priority }),
                ...(body.labels === undefined ? {} : { labels: body.labels })
              },
              effect: () =>
                priority !== null && body.labels === undefined && body.title === undefined &&
                  body.description === undefined && body.due_at === undefined
                  ? { kind: "ticket.priority", ticketId: ticket_id, from: ticket.priority, to: priority }
                  : { kind: "token" }
            }
          }),
          read.updateTicket(ticket_id, body, idempotency_key)
        ),
      set_ticket_status: ({ ticket_id, idempotency_key, status }) =>
        governed(
          "set_ticket_status",
          idempotency_key,
          Effect.map(ticketSubject(ticket_id), ({ ticket, subject }): Plan<unknown> => ({
            action: "SetTicketStatus",
            subject,
            sentence: `Status van ${ticket.number} op ${STATUS[status] ?? status} gezet`,
            before: STATUS[ticket.status] ?? ticket.status,
            after: STATUS[status] ?? status,
            ask: { _tag: "SetTicketStatus", ticketId: ticket_id, status },
            effect: () => ({ kind: "ticket.status", ticketId: ticket_id, from: ticket.status, to: status })
          })),
          read.moveTicket(ticket_id, status, idempotency_key)
        ),
      assign_ticket: ({ ticket_id, idempotency_key, member_id, unassign }) =>
        governed(
          "assign_ticket",
          idempotency_key,
          Effect.map(ticketSubject(ticket_id), ({ ticket, subject }): Plan<unknown> => ({
            action: "AssignTicket",
            subject,
            sentence: unassign === true ? `Toewijzing van ${ticket.number} weggehaald` : `${ticket.number} toegewezen`,
            ask: { _tag: "AssignTicket", ticketId: ticket_id, memberId: member_id, on: unassign !== true },
            effect: () => ({ kind: "ticket.assign", ticketId: ticket_id, memberId: member_id, on: unassign !== true })
          })),
          read.assignTicket(ticket_id, member_id, unassign !== true, idempotency_key)
        ),
      comment_on_ticket: ({ ticket_id, idempotency_key, ...body }) =>
        governed(
          "comment_on_ticket",
          idempotency_key,
          Effect.map(ticketSubject(ticket_id), ({ ticket, subject }): Plan<unknown> => ({
            action: "AddNote",
            subject,
            sentence: `Notitie geplaatst bij ${ticket.number}`,
            after: body.body,
            ask: { _tag: "CommentTicket", ticketId: ticket_id, body: body.body, mentions: body.mentions ?? [] },
            effect: token
          })),
          read.commentTicket(ticket_id, body, idempotency_key)
        )
    }
  })))
)

export const McpRoutes = McpServer.layerHttpRequestScoped({
  name: "Insyte",
  version: "1.0.0",
  instructions:
    "Insyte for dropshipping operators. Read the workspace's team and roles, and its orders, products, customers and suppliers; tag orders, note them, change their address, cancel and refund them; forward paid orders to their suppliers and move them to another supplier; start, approve, reject, label, receive, inspect and settle returns; write, change, move, assign and comment on tickets, with the key's scopes. Cancelling, refunding, forwarding and settling a return with a refund cannot be undone: confirm them with the person first.",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28],
  registrations: Tools
}).pipe(Layer.provide(McpAuth.layer))
