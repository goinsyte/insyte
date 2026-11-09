import { Context, type Effect, Schema } from "effect"

/*
 * What a committed write tells the rest of the system (M1.3–M1.4): an outbox event per fact, written in the use case's
 * transaction, so it exists exactly when the write does. Payloads hold ids and enums only: a sink reads what it needs
 * from the database, as of when it runs.
 */

export const OutboxEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("workspace.created"), workspaceId: Schema.String, userId: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("onboarding.step_completed"),
    workspaceId: Schema.String,
    userId: Schema.String,
    step: Schema.String
  }),
  // The invitation's mail, once the undo window has passed; the round says which link it carries.
  Schema.Struct({
    type: Schema.Literal("member.invited"),
    workspaceId: Schema.String,
    invitationId: Schema.String,
    /** The inviting member, and their person for analytics. */
    invitedBy: Schema.String,
    userId: Schema.String,
    round: Schema.Int
  }),
  // Someone accepted an invitation or used the shareable link (M5 tells the inviter).
  Schema.Struct({
    type: Schema.Literal("member.joined"),
    workspaceId: Schema.String,
    memberId: Schema.String,
    userId: Schema.String,
    via: Schema.Literals(["invitation", "link"])
  }),
  // A member asked for access (M5 tells whoever may grant it), and the answer (M5 tells the member).
  Schema.Struct({
    type: Schema.Literal("access.requested"),
    workspaceId: Schema.String,
    requestId: Schema.String,
    memberId: Schema.String
  }),
  Schema.Struct({
    type: Schema.Literal("access.decided"),
    workspaceId: Schema.String,
    requestId: Schema.String,
    memberId: Schema.String,
    state: Schema.Literals(["granted", "declined"])
  }),
  // A store was connected (M6.2): the backfill starts (M6.3), product analytics counts it.
  Schema.Struct({
    type: Schema.Literal("store.connected"),
    workspaceId: Schema.String,
    storeId: Schema.String,
    userId: Schema.String
  }),
  // A store's first import is in (M6.3): the onboarding moves past `sync`, and the first analysis may start.
  Schema.Struct({
    type: Schema.Literal("store.synced"),
    workspaceId: Schema.String,
    storeId: Schema.String
  }),
  // Orders changed in Insyte (M7.1): Shopify hears it once the undo window has passed. Tags travel as the change
  // (labels, not personal data), so a tag Shopify gained meanwhile stays; an address is read when it is sent.
  Schema.Struct({
    type: Schema.Literal("order.updated"),
    workspaceId: Schema.String,
    userId: Schema.String,
    orderIds: Schema.Array(Schema.String),
    change: Schema.Literals(["tags", "shipping", "fulfil"]),
    add: Schema.Array(Schema.String),
    remove: Schema.Array(Schema.String),
    // A supplier's parcel (M8.3): only its lines (Shopify ids), with the tracking it reported.
    lines: Schema.optional(Schema.Array(Schema.String)),
    tracking: Schema.optional(Schema.Struct({
      company: Schema.NullOr(Schema.String),
      number: Schema.String,
      url: Schema.NullOr(Schema.String)
    }))
  }),
  // Orders cancelled in Insyte (M7.1): to Shopify at once, since nothing can take it back.
  Schema.Struct({
    type: Schema.Literal("order.cancelled"),
    workspaceId: Schema.String,
    userId: Schema.String,
    orderIds: Schema.Array(Schema.String),
    restock: Schema.Boolean,
    notify: Schema.Boolean
  }),
  // A refund asked in Insyte (M7.2): to Shopify at once, since money that leaves cannot be taken back.
  Schema.Struct({
    type: Schema.Literal("refund.requested"),
    workspaceId: Schema.String,
    userId: Schema.String,
    orderIds: Schema.Array(Schema.String),
    refundId: Schema.String
  }),
  // Products changed in Insyte (M7.3): Shopify hears it once the undo window has passed; the values are read when it is
  // sent. The cost price is Insyte's own and never named here.
  Schema.Struct({
    type: Schema.Literal("product.updated"),
    workspaceId: Schema.String,
    userId: Schema.String,
    productIds: Schema.Array(Schema.String),
    fields: Schema.Array(Schema.Literals(["title", "description", "status", "price"]))
  }),
  // Customers tagged in Insyte (M7.4): to Shopify once the undo window has passed, as the change.
  Schema.Struct({
    type: Schema.Literal("customer.updated"),
    workspaceId: Schema.String,
    userId: Schema.String,
    customerIds: Schema.Array(Schema.String),
    add: Schema.Array(Schema.String),
    remove: Schema.Array(Schema.String)
  }),
  // A customer made in Insyte (M7.4): created in Shopify once the undo window has passed.
  Schema.Struct({
    type: Schema.Literal("customer.created"),
    workspaceId: Schema.String,
    userId: Schema.String,
    customerIds: Schema.Array(Schema.String)
  }),
  // Customers sent to a marketing list (M7.5), once the undo window has passed; the sync row holds who and where.
  Schema.Struct({
    type: Schema.Literal("marketing.sync_requested"),
    workspaceId: Schema.String,
    userId: Schema.String,
    syncId: Schema.String
  }),
  // An order whose parcel is stuck (M8.4): a carrier exception, or no movement for days. The team hears it.
  Schema.Struct({
    type: Schema.Literal("order.delayed"),
    workspaceId: Schema.String,
    userId: Schema.String,
    orderIds: Schema.Array(Schema.String),
    reason: Schema.Literals(["exception", "no_movement"]),
    note: Schema.NullOr(Schema.String)
  }),
  // Legs forwarded to their suppliers (M8.2): sent once the undo window has passed, or at once for a supplier set to
  // forward on payment (`userId` is then `system`).
  Schema.Struct({
    type: Schema.Literal("forwarding.send_requested"),
    workspaceId: Schema.String,
    userId: Schema.String,
    legIds: Schema.Array(Schema.String)
  }),
  // A record changed (M5.1): written with every audited write, so the realtime sink tells the workspace's open tabs
  // to refetch what they show of that kind. Ids only, never the record.
  Schema.Struct({
    type: Schema.Literal("records.changed"),
    workspaceId: Schema.String,
    kind: Schema.String,
    ids: Schema.Array(Schema.String)
  })
])
export type OutboxEvent = typeof OutboxEvent.Type

/**
 * The relay, as a port: after the transaction commits, the use case hands it the outbox ids it wrote, and the relay
 * delivers them now rather than at the next sweep (the minute cron catches anything a kick missed).
 */
export class Relay extends Context.Service<Relay, {
  /** `afterSeconds`: the events wait out an undo window (`outbox.not_before`), so the queue holds them that long. */
  readonly kick: (outboxIds: ReadonlyArray<string>, options?: { readonly afterSeconds?: number }) => Effect.Effect<void>
}>()("shared/Relay") {}

/**
 * The request's events still to kick (M5.1): a write that records its change (`Audit.write`) adds the event here, and
 * the transport kicks them once the request's transactions have committed (`WithDbLive`). Absent outside a request
 * (a script, the queue's consumer), where the minute sweep delivers them.
 */
export const PendingEvents = Context.Reference<{ readonly add: (outboxId: string) => void } | undefined>(
  "shared/PendingEvents",
  { defaultValue: () => undefined }
)
