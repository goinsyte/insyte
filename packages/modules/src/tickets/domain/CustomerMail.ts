import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect, Schema } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import type { MailboxDisconnected, NoMailbox } from "../../inbox/domain/Inbox.ts"
import { UndoTicket } from "../../shared/domain/Undo.ts"
import { TicketRow } from "./Tickets.ts"

/*
 * A ticket's "Klant informeren" (M11; widgets/04 §A, api.md `Tickets.emailCustomer`): the shopper the ticket is about
 * hears where it stands, from the team's mailbox, so their answer comes back into the inbox. The ticket waits on their
 * answer (`awaiting_reply`) and its activity says it was mailed. One undo takes the mail and the ticket back together.
 */

export const EmailCustomerInput = Schema.Struct({
  id: Schema.String,
  /** The words; absent, Insyte's short "stand van zaken" from the ticket (`statusText`). */
  body: Schema.optional(Schema.String.check(Schema.isMaxLength(10_000))),
  /** The caller's id for the mail (`mintId("eml")`): asked again with it, the mail already in line answers. */
  mailId: Schema.optional(Schema.String.check(Schema.isPattern(/^eml_[0-9a-hjkmnp-tv-z]{26}$/)))
})
export type EmailCustomerInput = typeof EmailCustomerInput.Type

export class CustomerEmailed extends Schema.Class<CustomerEmailed>("tickets/CustomerEmailed")({
  ticket: TicketRow,
  /** The inbox thread the mail went in. */
  threadId: Schema.String,
  to: Schema.String,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** The ticket names no shopper with an address: no customer, no order, or neither has an e-mail. */
export class NoCustomerAddress extends Schema.TaggedError<NoCustomerAddress>()("NoCustomerAddress", {
  ticketId: Schema.String
}) {}

/** The line the ticket's activity keeps of it, as the design writes it. */
export const MAILED_LINE = "Klant gemaild met de laatste stand van zaken. Wacht op antwoord."

/**
 * Insyte's "stand van zaken" when the team gives no words of its own: what it is about and that the team is on it,
 * nothing it does not know (no date, no outcome). The mailbox's signature goes under it.
 */
export const statusText = (f: { readonly customer: string | null; readonly about: string | null }) => {
  const first = f.customer?.trim().split(/\s+/)[0] ?? ""
  return {
    subject: f.about === null ? "Een update over je vraag" : `Een update over je bestelling ${f.about}`,
    body: [
      first === "" ? "Hoi," : `Hoi ${first},`,
      `Een korte update over ${f.about === null ? "je vraag" : `je bestelling ${f.about}`}: we zijn ermee bezig.`,
      "Zodra er nieuws is, laten we het je weten. Heb je intussen nog een vraag, antwoord dan gewoon op deze mail."
    ].join("\n\n")
  }
}

/** What a ticket's mail took, for the undo: the ticket's and the inbox's own ways back. */
export const MailedRestore = Schema.Struct({ ticket: Schema.Unknown, commentId: Schema.String, inbox: Schema.Unknown })
export type MailedRestore = typeof MailedRestore.Type

/**
 * The inbox, for a ticket's mail (architecture.md: never its use-cases/; implemented in `apps/api/src/platform/links`):
 * a reply in the ticket's thread with the shopper, or a new thread linked to the ticket, put in line on the ticket's
 * transaction without an undo of its own. `compensation` is the inbox's way back, run by the ticket's undo.
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class TicketMail extends Context.Service<TicketMail, {
  readonly send: (sql: SqlClient.SqlClient, input: {
    readonly ticketId: string
    /** The ticket's thread with the shopper, or null for a new one. */
    readonly threadId: string | null
    readonly to: string
    readonly subject: string
    readonly body: string
    /** The caller's id for the message. */
    readonly messageId?: string | undefined
  }) => Effect.Effect<
    { readonly threadId: string; readonly to: string; readonly outboxId: string; readonly compensation: unknown },
    NoMailbox | MailboxDisconnected | NotFound | Invalid | SqlError.SqlError,
    CurrentPrincipal
  >
  /** The inbox's way back for a mail `send` put in line. */
  readonly unsend: (
    sql: SqlClient.SqlClient,
    compensation: unknown
  ) => Effect.Effect<void, SqlError.SqlError | Forbidden | NotFound | Conflict, CurrentPrincipal>
}>()("tickets/TicketMail") {}
