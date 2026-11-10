import type { Conflict, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect, Schema } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import type { AlreadyRefunded, RefundId, RefundOverBalance, RefundOverLimit } from "../../orders/domain/Refunds.ts"

/**
 * Settling a return with a refund (M9.1): the order's refund, on the return's own transaction, as the same person and
 * within their limit; Shopify hears it through the outbox row it answers. The orders slice does it; this is what the
 * returns slice asks of it, composed where the app is put together.
 */
export class Refunder extends Context.Service<Refunder, {
  readonly refund: (
    sql: SqlClient.SqlClient,
    input: {
      readonly orderId: string
      readonly refundId: typeof RefundId.Type
      readonly amountMinor: number
      readonly note: string
    }
  ) => Effect.Effect<
    { readonly outboxId: string | null },
    RefundOverLimit | RefundOverBalance | AlreadyRefunded | NotFound | Conflict | SqlError.SqlError,
    CurrentPrincipal
  >
}>()("returns/Refunder") {}

/** Where a label sends a parcel from or to, in the parts a carrier needs. */
export interface LabelAddress {
  readonly name: string
  readonly line1: string
  readonly postcode: string
  readonly city: string
  /** ISO 3166-1 alpha-2. */
  readonly country: string
  readonly email?: string | undefined
  readonly phone?: string | undefined
}

/** A carrier would not make the label; `retry` when trying again later may help (the carrier was unreachable). */
export class LabelNotIssued extends Schema.TaggedError<LabelNotIssued>()("LabelNotIssued", {
  reason: Schema.String,
  retry: Schema.Boolean
}) {}

/** A label as the carrier made it: its tracking, the PDF to print, and the reference its status updates carry. */
export interface IssuedLabel {
  readonly carrier: string
  readonly tracking: string
  readonly trackingUrl: string | null
  /** `sendcloud:<parcel id>`: the parcel in the carrier's records, to cancel or look up. */
  readonly parcelRef: string
  readonly pdf: Uint8Array
}

/**
 * Return labels (M9.2; integrations.md §5.1): a label from the shopper to the store's return address with the chosen
 * carrier, through an aggregator (Sendcloud). Where the parcel is goes through AfterShip, as an outgoing parcel's does:
 * Sendcloud reports only parcels it also sent out. `configured` is false where no carrier account is set up: "Label
 * versturen" is then refused, and "zelf versturen" is the way.
 */
export class Labels extends Context.Service<Labels, {
  readonly configured: boolean
  readonly issue: (input: {
    /** The return's number, on the label and in the carrier's records. */
    readonly reference: string
    readonly carrier: string
    readonly from: LabelAddress
    readonly to: LabelAddress
    readonly weightGrams: number
  }) => Effect.Effect<IssuedLabel, LabelNotIssued>
}>()("returns/Labels") {}

/** Starts a label request's Workflow, named by its outbox event, so a relay that delivers it twice issues once. */
export class ReturnLabels extends Context.Service<ReturnLabels, {
  readonly start: (input: {
    readonly key: string
    readonly workspaceId: string
    readonly returnIds: ReadonlyArray<string>
  }) => Effect.Effect<void>
}>()("returns/ReturnLabels") {}
