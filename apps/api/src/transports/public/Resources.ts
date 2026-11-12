import {
  type ConflictV1,
  CurrentApiKey,
  type IdempotencyKeyReusedV1,
  type InvalidRequestV1,
  type ListQuery,
  type NotFoundV1,
  type RefundOverLimitV1,
  type ScopeMissingV1,
  type ValidationFailedV1
} from "@insyte/api/http/PublicApi"
import { Conflict, type Forbidden } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { isSpecial, type Permission, scopesOf } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CostsService } from "@insyte/modules/costs/Costs"
import type { CostLine, MonthFigures } from "@insyte/modules/costs/domain/Costs"
import { CustomersService } from "@insyte/modules/customers/Customers"
import type { LegRow } from "@insyte/modules/forwarding/domain/Forwarding"
import { ForwardingService } from "@insyte/modules/forwarding/Forwarding"
import { Members } from "@insyte/modules/members/Members"
import type { OrderDetail, OrderRow } from "@insyte/modules/orders/domain/Orders"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { ProductsService } from "@insyte/modules/products/Products"
import type { ProposalView } from "@insyte/modules/proposals/domain/Proposals"
import { ProposalsService } from "@insyte/modules/proposals/Proposals"
import { QueueService } from "@insyte/modules/queue/Queue"
import type { ReturnRow } from "@insyte/modules/returns/domain/Returns"
import { ReturnsService } from "@insyte/modules/returns/Returns"
import { RolesService } from "@insyte/modules/roles/RolesService"
import type { FilterNode, ListInput } from "@insyte/modules/shared/domain/Filter"
import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import { SuppliersService } from "@insyte/modules/suppliers/Suppliers"
import type { TicketComment, TicketRow } from "@insyte/modules/tickets/domain/Tickets"
import { TicketsService } from "@insyte/modules/tickets/Tickets"
import { TrackingService } from "@insyte/modules/tracking/Tracking"
import { Context, Effect, Layer } from "effect"

/*
 * What a key reads (M19.2, M19.3), in the public shape: `/v1` answers with these and the MCP tools return them, over
 * the same use cases the console calls, so a key and a person see the same team.
 */

const ACCESS = ["none", "read", "write", "manage"] as const

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

/** The use case's refusal as the scope the key misses, in the V1 envelope (a special action is its own scope). */
const scopeMissing = (e: Forbidden) =>
  Effect.flatMap(CurrentApiKey, (key) => {
    const scope = isSpecial(e.permission as Permission)
      ? e.permission
      : `${e.permission}.${e.level >= 2 ? "write" : "read"}`
    return Effect.fail<ScopeMissingV1>({
      error: { code: "ScopeMissingV1", message: `This key lacks ${scope}.`, request_id: key.requestId, scope }
    })
  })

/** A list's query as the use case's input; `status` is the one-status filter. */
const listInput = (query: ListQuery, statusField: string | undefined): ListInput => {
  const filter: FilterNode | undefined = query.status === undefined || statusField === undefined
    ? undefined
    : { kind: "rule", id: "status", field: statusField, op: "any", value: [query.status] }
  return {
    ...(query.limit === undefined ? {} : { limit: Math.min(200, Math.max(1, Math.floor(query.limit))) }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.store_id === undefined ? {} : { storeId: query.store_id }),
    ...(filter === undefined ? {} : { filter })
  }
}

/** A cursor the list did not hand out, in the V1 envelope. */
const invalid = (field: string) =>
  Effect.flatMap(CurrentApiKey, (key) =>
    Effect.fail<InvalidRequestV1>({
      error: {
        code: "InvalidRequestV1",
        message: `The ${field} is not one this list handed out.`,
        request_id: key.requestId,
        field
      }
    }))

/** A write's `Idempotency-Key`: the public API needs one on every write (MCP's tools go without). */
export const keyOf = (header: string | undefined) =>
  header !== undefined && header.trim() !== "" && header.length <= 255
    ? Effect.succeed(header)
    : Effect.flatMap(CurrentApiKey, (key) =>
      Effect.fail<InvalidRequestV1>({
        error: {
          code: "InvalidRequestV1",
          message: "Every write needs an Idempotency-Key header of up to 255 characters, the same when you retry.",
          request_id: key.requestId,
          field: "idempotency-key"
        }
      }))

/** An error in its V1 envelope, with the request's id. */
const fail = <Code extends string, Extra extends Record<string, unknown>>(code: Code, message: string, extra: Extra) =>
  Effect.flatMap(CurrentApiKey, (key) => Effect.fail({ error: { code, message, request_id: key.requestId, ...extra } }))

const ENTITY: Record<string, string> = { return: "return", ticket: "ticket", customer: "customer", member: "member" }
const notFound = (e?: { readonly entity?: string }) =>
  fail("NotFoundV1" as const, `No such ${ENTITY[e?.entity ?? ""] ?? "order"} in this key's stores.`, {})
const conflict = (reason: string) => fail("ConflictV1" as const, `Not possible now: ${reason}.`, { reason })
const validation = (fields: Readonly<Record<string, string>>) =>
  fail("ValidationFailedV1" as const, "The request has fields that cannot be used.", { fields: { ...fields } })

/** An order row in the public shape. */
const orderV1 = (o: OrderRow) => ({
  id: o.id,
  number: o.number,
  store_id: o.storeId,
  customer: { id: o.customerId, name: o.customerName, email: o.customerEmail },
  status: o.status,
  payment_status: o.paymentStatus,
  fulfillment_status: o.fulfillmentStatus,
  total: { amount_minor: o.totalMinor, currency: o.currency },
  tags: [...o.tags],
  line_count: o.lineCount,
  tracking: o.trackingNumber === null ? null : { carrier: o.carrier, number: o.trackingNumber },
  placed_at: iso(o.placedAt)!,
  updated_at: iso(o.updatedAt)!
})

const orderDetailV1 = (d: OrderDetail) => ({
  ...orderV1(d.order),
  lines: d.lines.map((l) => ({
    title: l.title,
    variant_title: l.variantTitle,
    sku: l.sku,
    quantity: l.quantity,
    unit_price_minor: l.unitPriceMinor
  })),
  shipping_address: d.shippingAddress,
  internal_note: d.internalNote?.body ?? null,
  refunds: d.refunds.map((r) => ({
    id: r.id,
    order_id: d.order.id,
    amount: { amount_minor: r.amountMinor, currency: r.currency },
    status: r.status,
    note: r.note,
    created_at: iso(r.createdAt)!
  }))
})

/** What an order command can refuse, as the use cases say it. */
type WriteRefusal =
  | Forbidden
  | { readonly _tag: "NotFound"; readonly entity?: string }
  | { readonly _tag: "Conflict"; readonly reason: string }
  | { readonly _tag: "Invalid"; readonly fields: Readonly<Record<string, string>> }
  | { readonly _tag: "IdempotencyKeyReused" }
  | { readonly _tag: "IdempotencyInFlight" }

type WriteV1 = ScopeMissingV1 | NotFoundV1 | ConflictV1 | ValidationFailedV1 | IdempotencyKeyReusedV1

/** An order command's refusal in its V1 envelope. */
const writeV1 = (e: WriteRefusal): Effect.Effect<never, WriteV1, CurrentApiKey> => {
  switch (e._tag) {
    case "Forbidden":
      return scopeMissing(e)
    case "NotFound":
      return notFound(e)
    case "Conflict":
      return conflict(e.reason)
    case "Invalid":
      return validation(e.fields)
    case "IdempotencyKeyReused":
      return fail("IdempotencyKeyReusedV1" as const, "This Idempotency-Key was used for a different request.", {})
    case "IdempotencyInFlight":
      return conflict("in_progress")
  }
}

/** The same for a refund, which may also be over the key's limit or more than is left. */
const refundV1 = (
  e:
    | WriteRefusal
    | { readonly _tag: "RefundOverLimit"; readonly limitMinor: number }
    | { readonly _tag: "RefundOverBalance" }
    | { readonly _tag: "AlreadyRefunded" }
): Effect.Effect<never, WriteV1 | RefundOverLimitV1, CurrentApiKey> => {
  switch (e._tag) {
    case "RefundOverLimit":
      return fail("RefundOverLimitV1" as const, "More than this key may refund on one order.", {
        limit_minor: e.limitMinor
      })
    case "RefundOverBalance":
      return conflict("over_balance")
    case "AlreadyRefunded":
      return conflict("already_refunded")
    default:
      return writeV1(e)
  }
}

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"

/**
 * The refund's id: from the caller's `Idempotency-Key` when there is one, so the same key is the same refund here and
 * Shopify's idempotency key there; a fresh one otherwise.
 */
const refundIdOf = (key: string | undefined, principalId: string) =>
  key === undefined || key.trim() === ""
    ? Effect.succeed(mintId("rfd"))
    : Effect.map(
      Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${principalId}:${key}`))),
      (bytes) => `rfd_${[...new Uint8Array(bytes).slice(0, 26)].map((b) => CROCKFORD[b % 32]).join("")}`
    )

const legV1 = (l: LegRow) => ({
  id: l.id,
  order: { id: l.orderId, number: l.orderNumber },
  store_id: l.storeId,
  supplier: l.supplier,
  from_supplier: l.fromSupplier,
  lines: l.lines.map((x) => ({ title: x.title, variant_title: x.variantTitle, quantity: x.quantity })),
  state: l.state,
  via: l.via,
  since: iso(l.since)!,
  confirm_by: iso(l.confirmBy),
  late: l.late,
  error: l.errorKind === null ? null : { kind: l.errorKind, note: l.errorNote }
})

const returnV1 = (r: ReturnRow) => ({
  id: r.id,
  number: r.number,
  kind: r.kind,
  order: { id: r.orderId, number: r.orderNumber },
  store_id: r.storeId,
  customer: { id: r.customerId, name: r.customerName, email: r.customerEmail },
  status: r.status,
  reason: { id: r.reasonId, label: r.reasonLabel },
  note: r.note,
  requested_resolution: r.requested,
  units: r.units,
  amount: { amount_minor: r.amountMinor, currency: r.currency },
  review_by: iso(r.deadline)!,
  late: r.status === "review" && r.deadline < Date.now(),
  resolution: r.resolution === null
    ? null
    : { kind: r.resolution.kind, amount_minor: r.resolution.amountMinor, resolved_at: iso(r.resolution.at)! },
  rejected_reason: r.rejectReason,
  label: r.label !== null
    ? {
      state: "issued",
      carrier: r.label.carrier,
      tracking: r.label.tracking,
      tracking_url: r.label.trackingUrl,
      reason: null
    }
    : r.labelRequest === null
    ? null
    : { state: r.labelRequest.state, carrier: null, tracking: null, tracking_url: null, reason: r.labelRequest.reason },
  created_at: iso(r.createdAt)!
})

/** The returns refusals in the V1 envelope: a move the status does not allow is a conflict, a line refused invalid. */
const returnsV1 = (
  e:
    | WriteRefusal
    | { readonly _tag: "IllegalReturnMove"; readonly from: string }
    | { readonly _tag: "ResolutionNotAllowed" }
    | { readonly _tag: "LineNotReturnable"; readonly why: string }
) => {
  switch (e._tag) {
    case "IllegalReturnMove":
      return conflict(`status_${e.from}`)
    case "ResolutionNotAllowed":
      return conflict("resolution_not_allowed")
    case "LineNotReturnable":
      return validation({ lines: e.why })
    default:
      return writeV1(e)
  }
}

/** The same for a label: no carrier set up, or no address to make one with, is a conflict. */
const labelV1 = (
  e:
    | WriteRefusal
    | { readonly _tag: "IllegalReturnMove"; readonly from: string }
    | { readonly _tag: "LabelsUnavailable" }
    | { readonly _tag: "LabelNotPossible"; readonly why: string }
) =>
  e._tag === "LabelsUnavailable"
    ? conflict("labels_unavailable")
    : e._tag === "LabelNotPossible"
    ? conflict(e.why)
    : returnsV1(e)

/** The same for settling one, which may refund. */
const resolveV1 = (
  e:
    | WriteRefusal
    | { readonly _tag: "IllegalReturnMove"; readonly from: string }
    | { readonly _tag: "ResolutionNotAllowed" }
    | { readonly _tag: "RefundOverLimit"; readonly limitMinor: number }
    | { readonly _tag: "RefundOverBalance" }
    | { readonly _tag: "AlreadyRefunded" }
) => e._tag === "IllegalReturnMove" || e._tag === "ResolutionNotAllowed" ? returnsV1(e) : refundV1(e)

const ticketV1 = (t: TicketRow) => ({
  id: t.id,
  number: t.number,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  source: t.source,
  labels: [...t.labels],
  assignees: t.assignees.map((a) => ({ id: a.id, name: a.name })),
  related: t.related === null ? null : { type: t.related.type, id: t.related.id, label: t.related.label },
  topic: t.topic,
  due_at: iso(t.dueAt),
  resolved_at: iso(t.resolvedAt),
  snoozed_until: iso(t.snoozedUntil),
  archived_at: iso(t.archivedAt),
  spam_at: iso(t.spamAt),
  deleted_at: iso(t.deletedAt),
  comment_count: t.commentCount,
  created_at: iso(t.createdAt)!,
  updated_at: iso(t.updatedAt)!
})

const commentV1 = (c: TicketComment) => ({
  id: c.id,
  author: { kind: c.author.kind, id: c.author.id, name: c.author.name },
  body: c.body,
  mentions: c.mentions.map((m) => ({ id: m.id, name: m.name })),
  created_at: iso(c.createdAt)!
})

/** The tickets refusals in the V1 envelope: someone not in the team is a field that cannot be used. */
const ticketsV1 = (field: string) =>
(
  e: WriteRefusal | { readonly _tag: "MemberNotActive"; readonly memberId: string }
) => e._tag === "MemberNotActive" ? validation({ [field]: "not_active" }) : writeV1(e)

/** An ISO time from the body, or the field it came in refused. */
const timeOf = (field: string, value: string | null | undefined) => {
  if (value === undefined || value === null) return Effect.succeed(value)
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? validation({ [field]: "invalid" }) : Effect.succeed(ms)
}

/** What a plate's filing runs, as a kind and the record it acts on. */
const actionV1 = (a: ProposalView["action"]) => {
  switch (a._tag) {
    case "ApproveReturn":
      return { kind: "approve_return" as const, subject_id: a.returnId }
    case "ApproveQualityCheck":
      return { kind: "approve_quality_check" as const, subject_id: a.checkId }
    case "NotifyDelayedOrder":
      return { kind: "notify_delayed_order" as const, subject_id: a.orderId }
    case "CreateSupplierTicket":
      return { kind: "create_supplier_ticket" as const, subject_id: a.productId }
  }
}

/** A plate in the public shape: the action as a kind and its record, the blocks as their values. */
const proposalV1 = (p: ProposalView) => ({
  id: p.id,
  number: p.number,
  state: p.state,
  subject_type: p.subjectType,
  subject_id: p.subjectId,
  action: actionV1(p.action),
  revision: p.plate.revision,
  heading: p.plate.heading,
  body: p.plate.body,
  dimension: p.plate.dimension,
  before: p.plate.before.value,
  after: p.plate.after.value,
  store: p.plate.witness,
  confidence: p.plate.confidence,
  confidence_basis: p.plate.confidenceBasis,
  file_label: p.plate.fileLabel,
  why: p.plate.why,
  evidence: p.plate.evidence,
  filed_at: iso(p.filedAt),
  executed_at: iso(p.executedAt),
  execution_error: p.executionError
})

/** A month's figures in the public shape. */
const figuresV1 = (f: MonthFigures) => ({
  month: f.month,
  revenue_minor: f.revenueMinor,
  orders: f.orders,
  ads_minor: f.adsMinor,
  other_minor: f.otherMinor,
  costs_minor: f.costsMinor,
  net_minor: f.netMinor,
  margin: f.margin,
  roas: f.roas
})

const costLineV1 = (l: CostLine, months: ReadonlyArray<string>) => ({
  id: l.id,
  name: l.name,
  kind: l.kind,
  rate: l.rate,
  rate_minor: l.rateMinor,
  source: l.source,
  reads_from_source: l.readsFromSource,
  months: months.map((m) => {
    const c = l.cells[m]
    return { month: m, amount_minor: c?.amountMinor ?? 0, typed: c?.typed ?? false, source: c?.source ?? "none" }
  })
})

/** A query parameter the use case refused, in the V1 envelope. */
const badQuery = (field: string, message: string) =>
  Effect.flatMap(CurrentApiKey, (key) =>
    Effect.fail<InvalidRequestV1>({
      error: { code: "InvalidRequestV1", message, request_id: key.requestId, field }
    }))

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

const make = Effect.gen(function*() {
  const members = yield* Members
  const roles = yield* RolesService
  const orders = yield* OrdersService
  const products = yield* ProductsService
  const customers = yield* CustomersService
  const forwarding = yield* ForwardingService
  const suppliers = yield* SuppliersService
  const tracking = yield* TrackingService
  const returns = yield* ReturnsService
  const tickets = yield* TicketsService
  const ticketOne = (id: string) => Effect.map(tickets.get(id), (d) => ticketV1(d.ticket))
  const queue = yield* QueueService
  const proposals = yield* ProposalsService
  const costs = yield* CostsService
  return {
    costs: (from?: string, to?: string) =>
      costs.list({ ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) }).pipe(
        Effect.map((list) => ({
          currency: list.currency,
          months: list.months,
          current: list.current,
          lines: list.lines.map((l) => costLineV1(l, list.months)),
          figures: list.figures.map(figuresV1)
        })),
        Effect.catchTags({
          Forbidden: scopeMissing,
          Invalid: () => badQuery("from", "The range runs from `from` to `to`, at most 36 months.")
        })
      ),
    costFigures: (months: string) => {
      const list = [...new Set(months.split(",").map((m) => m.trim()).filter((m) => m !== ""))]
      if (list.length === 0 || list.length > 36 || list.some((m) => !MONTH.test(m))) {
        return badQuery("months", "Name one to 36 months, YYYY-MM, separated by commas.")
      }
      return costs.figures({ months: list }).pipe(
        Effect.map((f) => ({ currency: f.currency, data: f.figures.map(figuresV1) })),
        Effect.catchTag("Forbidden", scopeMissing)
      )
    },
    queue: (tab?: "needs_you" | "drawn" | "all") =>
      queue.list(tab === undefined ? {} : { tab }).pipe(
        Effect.map((list) => ({
          data: list.rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            subject_type: r.subjectType,
            subject_id: r.subjectId,
            store: r.storeName,
            signal: r.signal,
            title: r.title,
            value_minor: r.valueMinor,
            currency: r.currency,
            due_at: iso(r.dueAt),
            state: r.state,
            proposal: r.proposal === null ? null : proposalV1(r.proposal)
          })),
          counts: { needs_you: list.counts.needsYou, drawn: list.counts.drawn, all: list.counts.all }
        }))
      ),
    proposal: (id: string) => proposals.get(id).pipe(Effect.map(proposalV1), Effect.catchTag("NotFound", notFound)),
    fileProposal: (id: string, key?: string) =>
      Idempotency.once(key, ["proposal.file", id], Effect.map(proposals.file(id), (c) => proposalV1(c.proposal))).pipe(
        Effect.catch((e) =>
          e._tag === "ProposalClosed"
            ? conflict("closed")
            : e._tag === "ProposalStale"
            ? conflict("stale")
            : writeV1(e)
        )
      ),
    me: Effect.gen(function*() {
      const key = yield* CurrentApiKey
      const { role } = yield* CurrentPrincipal
      return {
        key: { id: key.id, label: key.label, scopes: scopesOf(role.levels as Record<string, 0 | 1 | 2>) },
        workspace: { id: key.workspaceId, name: key.workspaceName }
      }
    }),
    members: members.get.pipe(
      Effect.map((team) => ({
        data: team.members.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: { id: m.roleId, label: m.roleLabel },
          status: m.deactivated ? "deactivated" as const : "active" as const,
          joined_at: iso(m.joinedAt)!,
          last_active_at: iso(m.lastActiveAt)
        }))
      })),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    roles: roles.list.pipe(
      Effect.map((list) => ({
        data: list.roles.map((r) => ({
          id: r.id,
          label: r.label,
          system: r.system,
          access: Object.fromEntries(Object.entries(r.levels).map(([area, level]) => [area, ACCESS[level]!]))
        }))
      })),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    orders: (query: ListQuery) =>
      orders.list(listInput(query, "status")).pipe(
        Effect.map((page) => ({
          data: page.rows.map(orderV1),
          next_cursor: page.nextCursor,
          total: page.counts.total
        })),
        Effect.catchTags({
          Forbidden: scopeMissing,
          CursorInvalid: () => invalid("cursor"),
          FilterFieldUnknown: () => invalid("status")
        })
      ),
    products: (query: ListQuery) =>
      products.list(listInput(query, "status")).pipe(
        Effect.map((page) => ({
          data: page.rows.map((p) => ({
            id: p.id,
            store_id: p.storeId,
            title: p.title,
            handle: p.handle,
            status: p.status,
            vendor: p.vendor,
            product_type: p.productType,
            tags: [...p.tags],
            image: p.image,
            variant_count: p.variantCount,
            price: { min_minor: p.priceMinMinor, max_minor: p.priceMaxMinor, currency: p.currency },
            available: p.available,
            updated_at: iso(p.updatedAt)!
          })),
          next_cursor: page.nextCursor,
          total: page.counts.total
        })),
        Effect.catchTags({
          Forbidden: scopeMissing,
          CursorInvalid: () => invalid("cursor"),
          FilterFieldUnknown: () => invalid("status")
        })
      ),
    customers: (query: ListQuery) =>
      customers.list(listInput(query, undefined)).pipe(
        Effect.map((page) => ({
          data: page.rows.map((c) => ({
            id: c.id,
            store_id: c.storeId,
            name: c.name,
            email: c.email,
            phone: c.phone,
            country: c.country,
            tags: [...c.tags],
            orders_count: c.ordersCount,
            lifetime_value: { amount_minor: c.lifetimeValueMinor, currency: c.currency },
            last_order_at: iso(c.lastOrderAt),
            updated_at: iso(c.updatedAt)!
          })),
          next_cursor: page.nextCursor,
          total: page.counts.total
        })),
        Effect.catchTags({
          Forbidden: scopeMissing,
          CursorInvalid: () => invalid("cursor"),
          FilterFieldUnknown: () => invalid("status")
        })
      ),
    // The order commands (M7, api.md §6), each once per `Idempotency-Key`.
    suppliers: suppliers.list({}).pipe(
      Effect.map((list) => ({
        data: list.rows.map((r) => ({
          id: r.id,
          name: r.name,
          paused: r.pausedAt !== null,
          forward_channel: r.forwardChannel,
          auto_forward: r.autoForward,
          contact_email: r.contactEmail,
          stats: { products: r.stats.products, open: r.stats.open, delayed: r.stats.delayed }
        }))
      })),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    tracking: (id: string) =>
      tracking.forOrder(id).pipe(
        Effect.map((t) => ({
          order_id: t.orderId,
          delayed_at: iso(t.delayedAt),
          delivered_at: iso(t.deliveredAt),
          parcels: t.parcels.map((p) => ({
            carrier: p.carrier,
            tracking_number: p.trackingNumber,
            tracking_url: p.trackingUrl,
            shipped_at: iso(p.shippedAt),
            status: p.status,
            checkpoint: p.checkpoint,
            exception: p.exception,
            estimated_delivery: iso(p.estimatedDelivery),
            delivered_at: iso(p.deliveredAt)
          }))
        })),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })
      ),
    returns: (status?: ReturnRow["status"]) =>
      returns.list({}).pipe(
        Effect.map((list) => ({
          data: list.rows.filter((r) => status === undefined || r.status === status).map(returnV1),
          counts: {
            total: list.counts.total,
            review: list.counts.review,
            late: list.counts.late,
            awaiting: list.counts.awaiting,
            ready: list.counts.ready
          }
        })),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    returnOne: (id: string) =>
      returns.get(id).pipe(
        Effect.map((d) => ({
          ...returnV1(d.record),
          lines: d.lines.map((l) => ({
            id: l.id,
            order_line_id: l.orderLineId,
            title: l.title,
            variant_title: l.variantTitle,
            quantity: l.qty,
            condition: l.condition
          })),
          window: { inside: d.window.inside, days: d.window.days, closes_on: iso(d.window.closesOn)! },
          allowed_resolutions: d.allowed.map((a) => ({ kind: a.kind, amount_minor: a.amountMinor }))
        })),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })
      ),
    startReturn: (
      body: {
        readonly order_id: string
        readonly lines: ReadonlyArray<{ readonly line_id: string; readonly quantity: number }>
        readonly reason_id: string
        readonly requested_resolution: ReturnRow["requested"]
        readonly note?: string | undefined
        readonly exchange_to?: string | undefined
      },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["return.start", body],
        Effect.map(
          returns.start({
            orderId: body.order_id,
            lines: body.lines.map((l) => ({ lineId: l.line_id, qty: l.quantity })),
            reasonId: body.reason_id,
            requested: body.requested_resolution,
            ...(body.note === undefined ? {} : { note: body.note }),
            ...(body.exchange_to === undefined ? {} : { exchangeTo: body.exchange_to })
          }),
          (change) => returnV1(change.returns[0]!)
        )
      ).pipe(Effect.catch(returnsV1)),
    moveReturn: (
      id: string,
      move:
        | { readonly kind: "approve"; readonly keep_item?: boolean | undefined }
        | { readonly kind: "reject"; readonly reason: string }
        | { readonly kind: "receive" }
        | {
          readonly kind: "inspect"
          readonly lines?:
            | ReadonlyArray<
              { readonly line_id: string; readonly condition: "ok" | "damaged" | "missing"; readonly restock: boolean }
            >
            | undefined
        },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["return", id, move],
        Effect.flatMap(
          move.kind === "approve"
            ? returns.approve({ ids: [id], ...(move.keep_item === undefined ? {} : { keepItem: move.keep_item }) })
            : move.kind === "reject"
            ? returns.reject({ ids: [id], reason: move.reason })
            : move.kind === "receive"
            ? returns.markReceived(id)
            : returns.inspect({
              id,
              ...(move.lines === undefined ? {} : {
                lines: move.lines.map((l) => ({ lineId: l.line_id, condition: l.condition, restock: l.restock }))
              })
            }),
          () => Effect.map(returns.get(id), (d) => returnV1(d.record))
        )
      ).pipe(Effect.catch(returnsV1)),
    trackReturn: (
      id: string,
      body: { readonly carrier: "PostNL" | "DHL" | "DPD" | "UPS"; readonly tracking: string },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["return.tracking", id, body],
        Effect.flatMap(
          returns.addTracking({ id, carrier: body.carrier, tracking: body.tracking }),
          () => Effect.map(returns.get(id), (d) => returnV1(d.record))
        )
      ).pipe(Effect.catch(returnsV1)),
    labelReturn: (id: string, key?: string) =>
      Idempotency.once(
        key,
        ["return.label", id],
        Effect.flatMap(returns.sendLabel({ ids: [id] }), () => Effect.map(returns.get(id), (d) => returnV1(d.record)))
      ).pipe(Effect.catch(labelV1)),
    resolveReturn: (
      id: string,
      body: { readonly resolution: ReturnRow["requested"]; readonly exchange_to?: string | undefined },
      key?: string
    ) =>
      Effect.gen(function*() {
        const principal = yield* CurrentPrincipal
        const refundId = yield* refundIdOf(key, principal.id)
        return yield* Idempotency.once(
          key,
          ["return.resolve", id, body],
          Effect.map(
            returns.resolve({
              id,
              resolution: body.resolution,
              ...(body.resolution === "refund" ? { refundId } : {}),
              ...(body.exchange_to === undefined ? {} : { exchangeTo: body.exchange_to })
            }),
            (change) => returnV1(change.returns[0]!)
          )
        )
      }).pipe(Effect.catch(resolveV1)),
    tickets: (view?: "all" | "open" | "unassigned" | "snoozed" | "done" | "archived" | "spam" | "trash") =>
      tickets.list(view === undefined ? {} : { view }).pipe(
        Effect.map((list) => ({
          data: list.rows.map(ticketV1),
          counts: {
            all: list.counts.all,
            open: list.counts.open,
            unassigned: list.counts.unassigned,
            snoozed: list.counts.snoozed,
            done: list.counts.done,
            archived: list.counts.archived,
            spam: list.counts.spam,
            trash: list.counts.trash
          }
        })),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    ticket: (id: string) =>
      tickets.get(id).pipe(
        Effect.map((d) => ({ ...ticketV1(d.ticket), comments: d.comments.map(commentV1) })),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })
      ),
    createTicket: (
      body: {
        readonly title: string
        readonly description?: string | undefined
        readonly status?: TicketRow["status"] | undefined
        readonly priority?: TicketRow["priority"] | undefined
        readonly assignee_ids?: ReadonlyArray<string> | undefined
        readonly labels?: ReadonlyArray<string> | undefined
        readonly due_at?: string | undefined
        readonly order_id?: string | undefined
        readonly customer_id?: string | undefined
      },
      key?: string
    ) =>
      Effect.gen(function*() {
        if (body.order_id !== undefined && body.customer_id !== undefined) {
          return yield* validation({ customer_id: "one_record" })
        }
        const dueAt = yield* timeOf("due_at", body.due_at)
        return yield* Idempotency.once(
          key,
          ["ticket.create", body],
          Effect.map(
            tickets.create({
              title: body.title,
              ...(body.description === undefined ? {} : { description: body.description }),
              ...(body.status === undefined ? {} : { status: body.status }),
              ...(body.priority === undefined ? {} : { priority: body.priority }),
              ...(body.assignee_ids === undefined ? {} : { assigneeIds: body.assignee_ids }),
              ...(body.labels === undefined ? {} : { labels: body.labels }),
              ...(dueAt === undefined ? {} : { dueAt }),
              ...(body.order_id === undefined ? {} : { related: { type: "order" as const, id: body.order_id } }),
              ...(body.customer_id === undefined
                ? {}
                : { related: { type: "customer" as const, id: body.customer_id } })
            }),
            (change) => ticketV1(change.tickets[0]!)
          )
        ).pipe(Effect.catch(ticketsV1("assignee_ids")))
      }),
    updateTicket: (
      id: string,
      body: {
        readonly title?: string | undefined
        readonly description?: string | undefined
        readonly priority?: TicketRow["priority"] | undefined
        readonly due_at?: string | null | undefined
        readonly labels?: ReadonlyArray<string> | undefined
      },
      key?: string
    ) =>
      Effect.gen(function*() {
        const dueAt = yield* timeOf("due_at", body.due_at)
        return yield* Idempotency.once(
          key,
          ["ticket.update", id, body],
          Effect.flatMap(
            tickets.update({
              ids: [id],
              ...(body.title === undefined ? {} : { title: body.title }),
              ...(body.description === undefined ? {} : { description: body.description }),
              ...(body.priority === undefined ? {} : { priority: body.priority }),
              ...(dueAt === undefined ? {} : { dueAt }),
              ...(body.labels === undefined ? {} : { labels: body.labels })
            }),
            () => ticketOne(id)
          )
        ).pipe(Effect.catch(ticketsV1("labels")))
      }),
    moveTicket: (id: string, status: TicketRow["status"], key?: string) =>
      Idempotency.once(
        key,
        ["ticket.status", id, status],
        Effect.flatMap(tickets.setStatus({ ids: [id], status }), () => ticketOne(id))
      ).pipe(Effect.catch(ticketsV1("status"))),
    assignTicket: (id: string, memberId: string, on: boolean, key?: string) =>
      Idempotency.once(
        key,
        ["ticket.assign", id, memberId, on],
        Effect.flatMap(
          on ? tickets.assign({ id, memberId }) : tickets.unassign({ id, memberId }),
          () => ticketOne(id)
        )
      ).pipe(Effect.catch(ticketsV1("member_id"))),
    commentTicket: (
      id: string,
      body: { readonly body: string; readonly mentions?: ReadonlyArray<string> | undefined },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["ticket.comment", id, body],
        Effect.map(
          tickets.comment({
            id,
            body: body.body,
            ...(body.mentions === undefined ? {} : { mentions: body.mentions })
          }),
          commentV1
        )
      ).pipe(Effect.catch(ticketsV1("mentions"))),
    legs: (view?: "to_forward" | "awaiting" | "forward_error") =>
      forwarding.list(view).pipe(
        Effect.map((list) => ({
          data: list.rows.map(legV1),
          counts: {
            to_forward: list.counts.toForward,
            awaiting: list.counts.awaiting,
            late: list.counts.late,
            error: list.counts.error
          }
        })),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    forwardLegs: (
      body: {
        readonly leg_ids: ReadonlyArray<string>
        readonly note?: string | undefined
        readonly via?: Readonly<Record<string, "portal" | "email" | "api">> | undefined
      },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["forward", body],
        Effect.map(
          forwarding.forward({
            ids: [...body.leg_ids],
            ...(body.note === undefined ? {} : { note: body.note }),
            ...(body.via === undefined ? {} : { via: { ...body.via } })
          }),
          (change) => ({ data: change.legs.map(legV1) })
        )
      ).pipe(Effect.catch(writeV1)),
    rerouteLeg: (id: string, body: { readonly supplier_id: string }, key?: string) =>
      Idempotency.once(
        key,
        ["reroute", id, body],
        Effect.flatMap(forwarding.reroute({ id, toSupplierId: body.supplier_id }), (change) =>
          change.legs[0] === undefined
            ? Effect.fail(new Conflict({ entity: "forwarding_item", reason: "same_supplier" }))
            : Effect.succeed(legV1(change.legs[0])))
      ).pipe(Effect.catch(writeV1)),
    order: (id: string) =>
      orders.get(id).pipe(Effect.map(orderDetailV1), Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })),
    tagOrder: (
      id: string,
      body: { readonly add?: ReadonlyArray<string> | undefined; readonly remove?: ReadonlyArray<string> | undefined },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["tags", id, body],
        Effect.flatMap(
          orders.tag({ ids: [id], add: [...(body.add ?? [])], remove: [...(body.remove ?? [])] }),
          () => Effect.map(orders.get(id), (d) => orderV1(d.order))
        )
      ).pipe(Effect.catch(writeV1)),
    noteOrder: (id: string, body: { body: string }, key?: string) =>
      Idempotency.once(
        key,
        ["note", id, body],
        Effect.flatMap(orders.setNote(id, body.body), () => Effect.map(orders.get(id), orderDetailV1))
      ).pipe(Effect.catch(writeV1)),
    shipOrderTo: (
      id: string,
      a: {
        readonly line1: string
        readonly line2?: string | null | undefined
        readonly city: string
        readonly postcode: string
        readonly region?: string | undefined
        readonly country: string
      },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["shipping_address", id, a],
        Effect.map(
          orders.updateShipping({
            id,
            address: {
              line1: a.line1,
              line2: a.line2 ?? null,
              city: a.city,
              postcode: a.postcode,
              region: a.region ?? "",
              country: a.country
            }
          }),
          (change) => orderV1(change.orders[0]!)
        )
      ).pipe(Effect.catch(writeV1)),
    cancelOrder: (id: string, body: { restock: boolean; notify_customer: boolean }, key?: string) =>
      Idempotency.once(
        key,
        ["cancel", id, body],
        Effect.map(
          orders.cancel({ ids: [id], restock: body.restock, notify: body.notify_customer }),
          (change) => orderV1(change.orders[0]!)
        )
      ).pipe(Effect.catch(writeV1)),
    refundOrder: (
      id: string,
      body: { readonly amount_minor: number; readonly note?: string | undefined },
      key?: string
    ) =>
      Effect.gen(function*() {
        const principal = yield* CurrentPrincipal
        const refundId = yield* refundIdOf(key, principal.id)
        return yield* Idempotency.once(
          key,
          ["refund", id, body],
          Effect.gen(function*() {
            const result = yield* orders.refund({
              id,
              refundId,
              amountMinor: body.amount_minor,
              ...(body.note === undefined ? {} : { note: body.note })
            })
            const detail = yield* orders.get(id)
            const refund = detail.refunds.find((r) => r.id === result.refundId)!
            return {
              id: refund.id,
              order_id: id,
              amount: { amount_minor: refund.amountMinor, currency: refund.currency },
              status: refund.status,
              note: refund.note,
              created_at: iso(refund.createdAt)!
            }
          })
        )
      }).pipe(
        Effect.catch(refundV1)
      )
  }
})

/**
 * The reads, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class Resources extends Context.Service<Resources, Effect.Success<typeof make>>()("api-worker/Resources") {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(
      Layer.mergeAll(
        Members.layer,
        RolesService.layer,
        OrdersService.layer,
        ProductsService.layer,
        CustomersService.layer,
        ForwardingService.layer,
        SuppliersService.layer,
        TrackingService.layer,
        ReturnsService.layer,
        TicketsService.layer,
        QueueService.layer,
        ProposalsService.layer,
        CostsService.layer
      )
    )
  )
}
