import { Context, type Effect, Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Marketing (M7.5): a workspace's Klaviyo account, connected by OAuth, and its customers sent to a Klaviyo list. Consent
 * is respected: only customers who said yes to marketing at the checkout go, and only with an address of their own (a
 * guest checkout through a payment provider has none). The send leaves the building, so it waits out the undo window.
 */

export const MarketingStatus = Schema.Struct({
  /** Whether this stage has the Klaviyo app at all. */
  configured: Schema.Boolean,
  /** The connected account's name, or `null` while none is connected. */
  account: Schema.NullOr(Schema.String)
})

export const BeginConnect = Schema.Struct({ returnPath: Schema.String.check(Schema.isMaxLength(500)) })

export const MarketingList = Schema.Struct({ id: Schema.String, name: Schema.String })

export const SyncInput = Schema.Struct({
  ids: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(10000)),
  /** An existing list; `null` to make one called `listName`. */
  listId: Schema.NullOr(Schema.String),
  listName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  /** Tags as a profile property (`insyte_tags`). */
  withTags: Schema.Boolean,
  /** Count only: nothing is written, nothing is sent. */
  dryRun: Schema.Boolean
})

export class SyncResult extends Schema.Class<SyncResult>("marketing/SyncResult")({
  /** `null` for a dry run, or when nobody could be sent. */
  syncId: Schema.NullOr(Schema.String),
  sendable: Schema.Int,
  skipped: Schema.Struct({ consent: Schema.Int, email: Schema.Int }),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** Connecting Klaviyo went wrong on the way back; the reason says where. */
export class MarketingConnectFailed extends Schema.TaggedError<MarketingConnectFailed>()("MarketingConnectFailed", {
  reason: Schema.Literals(["state", "exchange"]),
  returnPath: Schema.optional(Schema.String)
}) {}

/** Starts a sync's send once its window has passed: one `MarketingSyncWorkflow` per outbox event, named by it. */
export class MarketingSyncs extends Context.Service<MarketingSyncs, {
  readonly start: (
    input: { readonly key: string; readonly workspaceId: string; readonly syncId: string }
  ) => Effect.Effect<void>
}>()("marketing/MarketingSyncs") {}

/** A guest checkout through a payment provider leaves the provider's address, not the customer's. */
export const processorAddress = (email: string) => /@(stripe|paypal)\.com$/i.test(email)
