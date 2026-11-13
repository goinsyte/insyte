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
  // A shopper's request from the returns portal (M9.3): the returns team hears of it. `userId` is `system`.
  Schema.Struct({
    type: Schema.Literal("return.requested"),
    workspaceId: Schema.String,
    userId: Schema.String,
    returnIds: Schema.Array(Schema.String)
  }),
  // Someone was put on a ticket (M11 step 3): they hear of it once the undo window has passed. `by` is the principal.
  Schema.Struct({
    type: Schema.Literal("ticket.assigned"),
    workspaceId: Schema.String,
    userId: Schema.String,
    ticketId: Schema.String,
    memberIds: Schema.Array(Schema.String),
    by: Schema.String
  }),
  // A flow's version was published (M12 step 1), once the undo window has passed: counted as a product event.
  Schema.Struct({
    type: Schema.Literal("automation.published"),
    workspaceId: Schema.String,
    userId: Schema.String,
    automationId: Schema.String,
    version: Schema.Int,
    trigger: Schema.String,
    steps: Schema.Int
  }),
  // A run told a teammate something (M12 step 3): its "Team waarschuwen" step, or that it failed.
  Schema.Struct({
    type: Schema.Literal("automation.notify"),
    workspaceId: Schema.String,
    userId: Schema.String,
    kind: Schema.Literals(["alert", "failed"]),
    automationId: Schema.String,
    runId: Schema.String,
    memberIds: Schema.Array(Schema.String),
    detail: Schema.String
  }),
  // A ticket comment named teammates with `@` (M11 step 3): each of them hears of it.
  Schema.Struct({
    type: Schema.Literal("ticket.mentioned"),
    workspaceId: Schema.String,
    userId: Schema.String,
    ticketId: Schema.String,
    commentId: Schema.String,
    memberIds: Schema.Array(Schema.String),
    by: Schema.String
  }),
  // A chat message was posted, or changed (edited, taken back, pinned, reacted to, its card decided) (M11 step 4): the
  // realtime sink tells the tabs to refetch that conversation. `to` is who may hear of it (a DM's two); `null` is the
  // workspace's room (a channel). Ids only, never the message.
  Schema.Struct({
    type: Schema.Literal("chat.posted"),
    workspaceId: Schema.String,
    userId: Schema.String,
    conversationId: Schema.String,
    messageId: Schema.String,
    authorId: Schema.String,
    updated: Schema.Boolean,
    to: Schema.NullOr(Schema.Array(Schema.String))
  }),
  // A chat message named teammates with `@` (M11 step 4): each of them hears of it, unless they muted the conversation.
  Schema.Struct({
    type: Schema.Literal("chat.mentioned"),
    workspaceId: Schema.String,
    userId: Schema.String,
    conversationId: Schema.String,
    messageId: Schema.String,
    memberIds: Schema.Array(Schema.String),
    by: Schema.String
  }),
  // A supplier answered a quality check through its link (M9.4): the team hears of it. `userId` is `system`.
  Schema.Struct({
    type: Schema.Literal("quality_check.submitted"),
    workspaceId: Schema.String,
    userId: Schema.String,
    checkIds: Schema.Array(Schema.String)
  }),
  // A course for teammates (M17 step 4): published to its audience, or "Herinneren" to one person who has not finished.
  // Told once the undo window has passed, if the course is still live and they still have it to do. `by` is the
  // principal.
  Schema.Struct({
    type: Schema.Literal("course.assigned"),
    workspaceId: Schema.String,
    userId: Schema.String,
    courseId: Schema.String,
    memberIds: Schema.Array(Schema.String),
    reminder: Schema.Boolean,
    by: Schema.String
  }),
  // A question asked on a course (M17 step 4): its maker hears of it; an answer reaches the asker.
  Schema.Struct({
    type: Schema.Literal("course.question"),
    workspaceId: Schema.String,
    userId: Schema.String,
    questionId: Schema.String,
    by: Schema.String
  }),
  Schema.Struct({
    type: Schema.Literal("course.answered"),
    workspaceId: Schema.String,
    userId: Schema.String,
    questionId: Schema.String,
    by: Schema.String
  }),
  // Return labels asked for (M9.2): made at the carrier once the undo window has passed.
  Schema.Struct({
    type: Schema.Literal("return.label_requested"),
    workspaceId: Schema.String,
    userId: Schema.String,
    returnIds: Schema.Array(Schema.String)
  }),
  // A return the team started for a shopper (M9.3): the shopper hears of it once the undo window has passed.
  Schema.Struct({
    type: Schema.Literal("return.started"),
    workspaceId: Schema.String,
    userId: Schema.String,
    returnIds: Schema.Array(Schema.String)
  }),
  // Returns approved or rejected in Insyte (M9.3), once the undo window has passed: the shopper hears it, and Shopify
  // too for the returns that came from Shopify (`toShopify`, a subset of `returnIds`).
  Schema.Struct({
    type: Schema.Literal("return.approved"),
    workspaceId: Schema.String,
    userId: Schema.String,
    returnIds: Schema.Array(Schema.String),
    toShopify: Schema.Array(Schema.String)
  }),
  Schema.Struct({
    type: Schema.Literal("return.rejected"),
    workspaceId: Schema.String,
    userId: Schema.String,
    returnIds: Schema.Array(Schema.String),
    toShopify: Schema.Array(Schema.String)
  }),
  // A return label made (M9.3): the shopper gets it by mail. `userId` is `system`.
  Schema.Struct({
    type: Schema.Literal("return.label_issued"),
    workspaceId: Schema.String,
    userId: Schema.String,
    returnIds: Schema.Array(Schema.String)
  }),
  // A return settled with a gift card, a discount code or a new order (M9.3): made in Shopify once the undo window has
  // passed, or asked again after it failed.
  Schema.Struct({
    type: Schema.Literal("return.resolution_requested"),
    workspaceId: Schema.String,
    userId: Schema.String,
    returnIds: Schema.Array(Schema.String)
  }),
  // A return settled, with what the shopper gets in hand (M9.3): they hear what it is. `userId` is `system` where
  // Shopify made it.
  Schema.Struct({
    type: Schema.Literal("return.resolved"),
    workspaceId: Schema.String,
    userId: Schema.String,
    returnIds: Schema.Array(Schema.String)
  }),
  // A delay mail put in line by a filed plate (M10.2): sent to the shopper once the undo window has passed.
  Schema.Struct({
    type: Schema.Literal("order.delay_mail"),
    workspaceId: Schema.String,
    userId: Schema.String,
    mailId: Schema.String
  }),
  // A person filed a plate (M10.2): the command it carried ran as them. Product analytics counts it.
  Schema.Struct({
    type: Schema.Literal("proposal.filed"),
    workspaceId: Schema.String,
    userId: Schema.String,
    proposalId: Schema.String,
    action: Schema.String
  }),
  // A message the team wrote in the inbox (M11 step 2): sent through its mailbox once the undo window has passed.
  Schema.Struct({
    type: Schema.Literal("thread.message_queued"),
    workspaceId: Schema.String,
    userId: Schema.String,
    messageId: Schema.String
  }),
  // A chargeback opened (M13 step 3): whoever handles chargebacks hears of it, once one opened by hand has waited out
  // its undo window; `by` is who opened it (null for a provider's), who does not hear of their own.
  Schema.Struct({
    type: Schema.Literal("chargeback.opened"),
    workspaceId: Schema.String,
    chargebackId: Schema.String,
    by: Schema.NullOr(Schema.String)
  }),
  // A case's deadline is coming (the hourly sweep, M13 step 3): five days, two days or six hours to go.
  Schema.Struct({
    type: Schema.Literal("chargeback.deadline_near"),
    workspaceId: Schema.String,
    chargebackId: Schema.String,
    offset: Schema.Literals(["5d", "2d", "6h"])
  }),
  // Packs asked for (M13 step 4): one `EvidencePackWorkflow` per case, named by its run.
  Schema.Struct({
    type: Schema.Literal("chargeback.pack_requested"),
    workspaceId: Schema.String,
    userId: Schema.String,
    packs: Schema.Array(Schema.Struct({ chargebackId: Schema.String, runId: Schema.String }))
  }),
  // Insyte switched a webhook endpoint off after five failed attempts in a row (M19.4): whoever manages the
  // integrations hears of it. `userId` is `system`.
  Schema.Struct({
    type: Schema.Literal("webhook.disabled"),
    workspaceId: Schema.String,
    userId: Schema.String,
    endpointId: Schema.String
  }),
  // A sheet was saved, renamed, moved, shared or put back (M14 step 4): the realtime sink tells the tabs of the members
  // who can open it (`to`) to read it again. Its version tells an open editor whether it already has it.
  Schema.Struct({
    type: Schema.Literal("sheet.changed"),
    workspaceId: Schema.String,
    sheetId: Schema.String,
    version: Schema.Int,
    by: Schema.String,
    to: Schema.Array(Schema.String)
  }),
  // A month's supplier statements closed (M13 step 6): whoever pays them hears they are ready. `userId` is `system`.
  Schema.Struct({
    type: Schema.Literal("statements.closed"),
    workspaceId: Schema.String,
    userId: Schema.String,
    month: Schema.String,
    statementIds: Schema.Array(Schema.String)
  }),
  // A CSV was uploaded into the Data hub (M14 step 5): its `ImportParseWorkflow` reads it into rows.
  Schema.Struct({
    type: Schema.Literal("import.uploaded"),
    workspaceId: Schema.String,
    importId: Schema.String,
    userId: Schema.String
  }),
  // An export was asked for (M14 step 5): its `ExportWorkflow` writes the file.
  Schema.Struct({
    type: Schema.Literal("export.requested"),
    workspaceId: Schema.String,
    exportId: Schema.String,
    userId: Schema.String
  }),
  // An export's file is ready, or could not be written (M14 step 5): the member who asked hears it. `userId` is theirs.
  Schema.Struct({
    type: Schema.Literal("export.finished"),
    workspaceId: Schema.String,
    exportId: Schema.String,
    userId: Schema.String,
    state: Schema.Literals(["ready", "failed"])
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
