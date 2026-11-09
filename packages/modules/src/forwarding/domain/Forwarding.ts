import { Context, type Effect, Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Forwarding (M8.2; domain.md §5.1, `lib/forwarding.ts`). A leg is one paid order × one supplier: the lines it carries go
 * to that supplier, who confirms, or it goes wrong. `sending` is a forward waiting out its undo window; `awaiting` is
 * sent, until the supplier (or the operator) confirms. A leg is late once `confirmBy` has passed.
 */

export const LegState = Schema.Literals(["to_forward", "sending", "awaiting", "confirmed", "error", "cancelled"])
export type LegState = typeof LegState.Type

/** Why a leg failed: the design's four, with `send_failed` and `supplier_paused` (founder, 2026-11-09). */
export const ErrorKind = Schema.Literals([
  "stock",
  "address",
  "no_supplier",
  "rejected",
  "send_failed",
  "supplier_paused"
])
export type ErrorKind = typeof ErrorKind.Type

export const Via = Schema.Literals(["portal", "email", "api"])
export type Via = typeof Via.Type

export const ForwardView = Schema.Literals(["to_forward", "awaiting", "forward_error"])
export type ForwardView = typeof ForwardView.Type

const Party = Schema.Struct({ id: Schema.String, name: Schema.String })

export class LegRow extends Schema.Class<LegRow>("forwarding/LegRow")({
  id: Schema.String,
  orderId: Schema.String,
  orderNumber: Schema.String,
  customerName: Schema.String,
  storeId: Schema.String,
  totalMinor: Schema.Int,
  currency: Schema.String,
  supplier: Schema.NullOr(Party),
  /** The supplier it was taken from by a reroute ("was {X}"). */
  fromSupplier: Schema.NullOr(Party),
  lines: Schema.Array(Schema.Struct({
    title: Schema.String,
    variantTitle: Schema.NullOr(Schema.String),
    quantity: Schema.Int,
    image: Schema.NullOr(Schema.String)
  })),
  state: LegState,
  via: Schema.NullOr(Via),
  /** When it entered its state. */
  since: Schema.Finite,
  /** While `sending`, when the undo window closes. */
  sendingUntil: Schema.NullOr(Schema.Finite),
  confirmBy: Schema.NullOr(Schema.Finite),
  late: Schema.Boolean,
  errorKind: Schema.NullOr(ErrorKind),
  /** The supplier's own words, or why sending failed. */
  errorNote: Schema.NullOr(Schema.String),
  operatorNote: Schema.NullOr(Schema.String),
  forwardedBy: Schema.NullOr(Schema.String)
}) {}

export const LegCounts = Schema.Struct({
  toForward: Schema.Int,
  awaiting: Schema.Int,
  late: Schema.Int,
  error: Schema.Int
})

export class LegList extends Schema.Class<LegList>("forwarding/LegList")({
  rows: Schema.Array(LegRow),
  counts: LegCounts
}) {}

const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))

export const ListInput = Schema.Struct({ view: ForwardView })

/** "Doorsturen": the legs, how each supplier gets them where the operator says otherwise, and a note for the suppliers. */
export const ForwardInput = Schema.Struct({
  ids: Ids,
  via: Schema.optional(Schema.Record(Schema.String, Via)),
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(1000)))
})

export const IdsInput = Schema.Struct({ ids: Ids })

/** "Andere leverancier": the leg goes to another supplier, to be forwarded there. */
export const RerouteInput = Schema.Struct({ id: Schema.String, toSupplierId: Schema.String })

export class ForwardingChange extends Schema.Class<ForwardingChange>("forwarding/ForwardingChange")({
  legs: Schema.Array(LegRow),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** A leg as it was, for `Shared.undo`. */
const Before = Schema.Struct({
  id: Schema.String,
  state: LegState,
  supplierId: Schema.NullOr(Schema.String),
  fromSupplierId: Schema.NullOr(Schema.String),
  via: Schema.NullOr(Via),
  since: Schema.Finite,
  errorKind: Schema.NullOr(ErrorKind),
  errorNote: Schema.NullOr(Schema.String),
  operatorNote: Schema.NullOr(Schema.String),
  confirmedAt: Schema.NullOr(Schema.Finite)
})
export type Before = typeof Before.Type

export const ForwardingRestore = Schema.Struct({
  legs: Schema.Array(Before),
  /** Orders whose status moved to `at_supplier`, and from what. */
  orders: Schema.Array(Schema.Struct({ id: Schema.String, status: Schema.String }))
})
export type ForwardingRestore = typeof ForwardingRestore.Type

/**
 * What a supplier receives of an order (M8: their own lines, where to ship them, the operator's note), and nothing else:
 * no customer email or phone, no prices, no other supplier's lines. The custom API gets it as signed JSON; the mail says
 * the same.
 */
export const SupplierOrder = Schema.Struct({
  type: Schema.Literal("order.forwarded"),
  leg_id: Schema.String,
  order: Schema.Struct({ number: Schema.String, placed_at: Schema.String, note: Schema.NullOr(Schema.String) }),
  ship_to: Schema.Struct({
    name: Schema.NullOr(Schema.String),
    line1: Schema.NullOr(Schema.String),
    line2: Schema.NullOr(Schema.String),
    city: Schema.NullOr(Schema.String),
    postcode: Schema.NullOr(Schema.String),
    region: Schema.NullOr(Schema.String),
    country: Schema.NullOr(Schema.String)
  }),
  lines: Schema.Array(Schema.Struct({
    sku: Schema.NullOr(Schema.String),
    title: Schema.String,
    variant_title: Schema.NullOr(Schema.String),
    quantity: Schema.Int
  }))
})
export type SupplierOrder = typeof SupplierOrder.Type

/** The supplier's endpoint answered with a failure, or could not be reached. */
export class SupplierApiError extends Schema.TaggedError<SupplierApiError>()("SupplierApiError", {
  reason: Schema.String,
  /** Worth trying again (unreachable, 5xx, 429) rather than final (a 4xx refusal). */
  retryable: Schema.Boolean
}) {}

/**
 * A supplier's own API (M8.2; domain.md §5 `supplier_integrations`): Insyte posts JSON signed with the supplier's secret
 * (`Insyte-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`).
 */
export class SupplierApi extends Context.Service<SupplierApi, {
  readonly post: (
    url: string,
    secret: string,
    body: SupplierOrder | { readonly type: "ping" }
  ) => Effect.Effect<{ readonly ms: number }, SupplierApiError>
}>()("forwarding/SupplierApi") {}

/** Starts the durable send of a forward, once per outbox event. */
export class ForwardSends extends Context.Service<ForwardSends, {
  readonly start: (
    input: { readonly key: string; readonly workspaceId: string; readonly legIds: ReadonlyArray<string> }
  ) => Effect.Effect<void>
}>()("forwarding/ForwardSends") {}
