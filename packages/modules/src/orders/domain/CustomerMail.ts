import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"
import { OrderRow } from "./Orders.ts"

/*
 * Mail the shopper from anywhere (M7 9.1; api.md §2.4 `Orders.emailCustomer`, `Orders.sendTrackingUpdate`): the team's
 * mail to the shopper of one order, in the store's name, put in line in `order_mails` and sent by the relay's mail sink
 * once the undo window has passed (ADR-0023). The words are fixed when it is put in line, so what the team saw is what
 * the shopper reads.
 *
 * - `message`: the team's own words (forwarding's "Klant mailen", `/v1`, an automation's `send_email`). The caller may
 *   mint the mail's id (`oml_…`): asked again with it, the same mail answers and nothing more is sent.
 * - `tracking`: "Track & trace-update sturen", the order's newest parcel told once per tracking number.
 */

/** The caller's id for the mail, as `mintId("oml")` makes them. */
const MailId = Schema.String.check(Schema.isPattern(/^oml_[0-9a-hjkmnp-tv-z]{26}$/))

export const EmailCustomerInput = Schema.Struct({
  orderId: Schema.String,
  subject: Schema.String.check(Schema.isMaxLength(255)),
  body: Schema.String.check(Schema.isMaxLength(10_000)),
  /** Absent: Insyte mints one, and asking twice sends twice. */
  id: Schema.optional(MailId)
})
export type EmailCustomerInput = typeof EmailCustomerInput.Type

export const MailState = Schema.Literals(["scheduled", "sent", "cancelled", "failed"])

/** One shopper mail about an order, as the team may see it. */
export const OrderMail = Schema.Struct({
  id: Schema.String,
  orderId: Schema.String,
  kind: Schema.Literals(["delay", "tracking", "message"]),
  state: MailState,
  to: Schema.String,
  subject: Schema.String
})
export type OrderMail = typeof OrderMail.Type

/** What `emailCustomer` answers: the mail in line, and its undo (none when the id named a mail already there). */
export class CustomerMailQueued extends Schema.Class<CustomerMailQueued>("orders/CustomerMailQueued")({
  mail: OrderMail,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** Why an order of a selection got no track-and-trace update. */
export const TrackingSkip = Schema.Literals(["closed", "no_tracking", "no_email", "already_told"])

/** What "Track & trace-update sturen" did: the orders told (as the list shows them), those left out and why, one undo. */
export class TrackingSent extends Schema.Class<TrackingSent>("orders/TrackingSent")({
  orders: Schema.Array(OrderRow),
  skipped: Schema.Array(Schema.Struct({ id: Schema.String, reason: TrackingSkip })),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** The order has no address to mail (Shopify had none for it). */
export class CustomerMailRefused extends Schema.TaggedError<CustomerMailRefused>()("CustomerMailRefused", {
  orderId: Schema.String,
  reason: Schema.Literals(["no_email"])
}) {}

/** The mails a command put in line, for `Shared.undo`: called off before they leave. */
export const MailsRestore = Schema.Struct({ mails: Schema.Array(Schema.String) })
export type MailsRestore = typeof MailsRestore.Type

/** The team's words as paragraphs: split on blank lines, each trimmed, none empty. */
export const paragraphsOf = (body: string): ReadonlyArray<string> =>
  body.replaceAll("\r\n", "\n").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== "")

export interface TrackingFacts {
  /** The store's name, which the mail is sent in. */
  readonly shop: string
  /** The name on the order. */
  readonly customer: string
  /** `#1003`. */
  readonly number: string
  readonly carrier: string | null
}

/** The track-and-trace update, from the order's fields: the parcel itself goes beside it (the template's facts). */
export const trackingText = (f: TrackingFacts) => {
  const first = f.customer.trim().split(/\s+/)[0] ?? ""
  return {
    subject: `Je bestelling ${f.number} is onderweg`,
    paragraphs: [
      first === "" ? "Hallo," : `Hallo ${first},`,
      `Je bestelling ${f.number} bij ${f.shop} is onderweg${f.carrier === null ? "" : ` met ${f.carrier}`}.`,
      "Met het track & trace-nummer volg je het pakket tot het bij je is.",
      "Heb je een vraag, neem dan contact op met de winkel en noem je bestelnummer."
    ]
  }
}
