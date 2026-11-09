import { Context, type Effect, Schema } from "effect"

/*
 * Tracking (M8.4; integrations.md AfterShip): Insyte's account registers every parcel's tracking number and hears its
 * status back (decision D3: one AfterShip account for all merchants). The port names what Insyte needs of it; the adapter
 * is `@insyte/integrations-aftership`, with a recorded twin for tests and a manual one where no key is set.
 */

export const DeliveryStatus = Schema.Literals([
  "pending",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "expired",
  "returned"
])
export type DeliveryStatus = typeof DeliveryStatus.Type

/** What AfterShip knows of a parcel now. */
export interface TrackingSnapshot {
  readonly status: DeliveryStatus
  /** The latest checkpoint, as the carrier wrote it. */
  readonly checkpoint: string | null
  /** Why it is stuck, when it is. */
  readonly exception: string | null
  readonly estimatedDelivery: Date | null
  readonly deliveredAt: Date | null
  readonly lastEventAt: Date | null
}

export class TrackingError extends Schema.TaggedError<TrackingError>()("TrackingError", {
  reason: Schema.String,
  /** Worth trying again later (unreachable, rate limited), rather than a tracking number AfterShip refuses. */
  retryable: Schema.Boolean
}) {}

export class Tracking extends Context.Service<Tracking, {
  /** False where no AfterShip key is set: parcels keep Shopify's own status, nothing is registered. */
  readonly configured: boolean
  readonly register: (input: {
    readonly deliveryId: string
    readonly trackingNumber: string
    /** The carrier as Shopify names it; AfterShip detects it when absent. */
    readonly carrier: string | null
    /** The order's number, for AfterShip's own screens. */
    readonly title: string
  }) => Effect.Effect<{ readonly aftershipId: string; readonly slug: string | null }, TrackingError>
  readonly get: (aftershipId: string) => Effect.Effect<TrackingSnapshot, TrackingError>
  /** Whether a webhook's raw body carries AfterShip's signature (`aftership-hmac-sha256`). */
  readonly verifyWebhook: (body: Uint8Array, signature: string) => Effect.Effect<boolean>
  /** Reads a webhook's body: which delivery it is about (our id, in its custom fields) and the parcel now. */
  readonly readWebhook: (
    body: unknown
  ) => { readonly deliveryId: string; readonly snapshot: TrackingSnapshot } | undefined
}>()("tracking/Tracking") {}

export const Parcel = Schema.Struct({
  id: Schema.String,
  /** AfterShip's side of it (the id its webhooks name); `null` for a parcel without a tracking number. */
  deliveryId: Schema.NullOr(Schema.String),
  carrier: Schema.NullOr(Schema.String),
  trackingNumber: Schema.NullOr(Schema.String),
  trackingUrl: Schema.NullOr(Schema.String),
  shippedAt: Schema.NullOr(Schema.Finite),
  status: Schema.NullOr(DeliveryStatus),
  checkpoint: Schema.NullOr(Schema.String),
  exception: Schema.NullOr(Schema.String),
  estimatedDelivery: Schema.NullOr(Schema.Finite),
  deliveredAt: Schema.NullOr(Schema.Finite),
  lastEventAt: Schema.NullOr(Schema.Finite)
})

/** `Orders.tracking`: an order's parcels, Shopify's and AfterShip's word together, and whether it is delayed. */
export class OrderTracking extends Schema.Class<OrderTracking>("tracking/OrderTracking")({
  orderId: Schema.String,
  parcels: Schema.Array(Parcel),
  delayedAt: Schema.NullOr(Schema.Finite),
  deliveredAt: Schema.NullOr(Schema.Finite)
}) {}
