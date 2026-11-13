import { Schema } from "effect"
import { StoreAccess } from "../../shared/domain/Stores.ts"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Outbound webhooks (M19.4) as Instellingen → Webhooks reads them (`lib/webhooks-core.ts`): an endpoint is a URL, the
 * events it takes, the payload version, the stores, extra headers, a retry policy and a switch; Insyte signs every
 * delivery with the endpoint's secret and stops sending after five failed attempts in a row. The secret and the extra
 * headers' values are sealed; the list shows the secret's start and the headers' names, never a value. Times are epoch
 * milliseconds.
 */

export const EndpointState = Schema.Literals(["active", "failing", "disabled", "paused", "new"])
export type EndpointState = typeof EndpointState.Type

export const WebhookRetry = Schema.Literals([0, 3, 5, 8])

export class WebhookEndpointView extends Schema.Class<WebhookEndpointView>("developer/WebhookEndpointView")({
  id: Schema.String,
  url: Schema.String,
  description: Schema.String,
  events: Schema.Array(Schema.String),
  apiVersion: Schema.String,
  stores: StoreAccess,
  /** What is shown of the secret: `whsec_` and its first characters. */
  secretPrefix: Schema.String,
  secretRotatedAt: Schema.NullOr(Schema.Finite),
  /** The extra headers' names; their values are sealed and never come back. */
  headers: Schema.Array(Schema.String),
  retry: WebhookRetry,
  active: Schema.Boolean,
  autoDisabledAt: Schema.NullOr(Schema.Finite),
  failures: Schema.Int,
  createdAt: Schema.Finite,
  createdBy: Schema.String,
  state: EndpointState,
  /** The last 24 hours' deliveries: how many, how many failed, their average time (`null` with none). */
  health: Schema.Struct({ count: Schema.Int, failed: Schema.Int, avgMs: Schema.NullOr(Schema.Int) }),
  deliveries: Schema.Int
}) {}

export const DeliveryOutcome = Schema.Literals(["pending", "retrying", "delivered", "failed", "cancelled"])

export class WebhookDeliveryView extends Schema.Class<WebhookDeliveryView>("developer/WebhookDeliveryView")({
  id: Schema.String,
  endpointId: Schema.String,
  eventId: Schema.String,
  event: Schema.String,
  test: Schema.Boolean,
  /** The last attempt's HTTP status; `null` for a time-out, a refused address, or none yet. */
  status: Schema.NullOr(Schema.Int),
  outcome: DeliveryOutcome,
  /** Why an attempt got no status: `timeout`, `network`, `redirect`, `private_address`. */
  error: Schema.NullOr(Schema.String),
  attempts: Schema.Int,
  maxAttempts: Schema.Int,
  ms: Schema.NullOr(Schema.Int),
  at: Schema.Finite,
  nextAttemptAt: Schema.NullOr(Schema.Finite)
}) {}

/** One delivery opened: what was sent (the body and Insyte's own headers) and the start of what came back. */
export class WebhookDeliveryDetail extends Schema.Class<WebhookDeliveryDetail>("developer/WebhookDeliveryDetail")({
  delivery: WebhookDeliveryView,
  body: Schema.Unknown,
  signature: Schema.NullOr(Schema.String),
  response: Schema.NullOr(Schema.String),
  /** The body and the answer are left out: the role does not read the event's area (orders, customers, …). */
  redacted: Schema.Boolean
}) {}

export const WebhookHeader = Schema.Struct({
  key: Schema.String,
  /** `null`: keep the value it has (a value never comes back to the console). */
  value: Schema.NullOr(Schema.String)
})

export const EndpointInput = Schema.Struct({
  url: Schema.String,
  description: Schema.String,
  events: Schema.Array(Schema.String),
  apiVersion: Schema.String,
  stores: StoreAccess,
  headers: Schema.Array(WebhookHeader),
  retry: WebhookRetry,
  active: Schema.Boolean
})
export type EndpointInput = typeof EndpointInput.Type

export const UpdateEndpoint = Schema.Struct({ id: Schema.String, ...EndpointInput.fields })
export type UpdateEndpoint = typeof UpdateEndpoint.Type

export const EndpointRef = Schema.Struct({ id: Schema.String })
export const SetActive = Schema.Struct({ id: Schema.String, active: Schema.Boolean })
export const SendTest = Schema.Struct({ id: Schema.String, event: Schema.String })
export const DeliveryRef = Schema.Struct({ id: Schema.String })
export const DeliveriesQuery = Schema.Struct({ endpointId: Schema.String })

/** A new endpoint and its signing secret, in full. */
export class EndpointWithSecret extends Schema.Class<EndpointWithSecret>("developer/EndpointWithSecret")({
  endpoint: WebhookEndpointView,
  secret: Schema.String
}) {}

/** A change the console can take back ("Ongedaan maken"), with the endpoint as it is now. */
export class EndpointChange extends Schema.Class<EndpointChange>("developer/EndpointChange")({
  endpoint: Schema.NullOr(WebhookEndpointView),
  undo: UndoTicket
}) {}

export class RotatedSecret extends Schema.Class<RotatedSecret>("developer/RotatedSecret")({
  endpoint: WebhookEndpointView,
  secret: Schema.String,
  undo: UndoTicket
}) {}

export const DeliveryStarted = Schema.Struct({ deliveryId: Schema.String })
export const RevealedSecret = Schema.Struct({ secret: Schema.String })

/** The endpoint's state, as domain.md §12.11 has it. */
export const stateOf = (e: {
  readonly active: boolean
  readonly autoDisabledAt: unknown
  readonly failures: number
  readonly deliveries: number
}): EndpointState =>
  e.autoDisabledAt !== null
    ? "disabled"
    : !e.active
    ? "paused"
    : e.failures > 0
    ? "failing"
    : e.deliveries === 0
    ? "new"
    : "active"
