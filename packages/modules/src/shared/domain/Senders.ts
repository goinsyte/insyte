import { Option, Schema } from "effect"
import type { MailKind } from "./Mailer.ts"

/*
 * Who a customer's mail comes from (M17 step 20.1c; widgets/05 §7.4): the one rule every slice that mails a shopper
 * goes through (`use-cases/Senders.ts`). E-mail en domein keeps it in `workspace_settings` section `domain_senders`:
 * "Mails van Insyte" (`from`), "Antwoorden naar" (`replyTo`) and the brand's sending domain as Resend last reported it.
 * A shopper's mail goes from `from` once that domain is verified and `from` is on it; until then from Insyte's own
 * sending address, in the store's name, as before. An answer goes to `replyTo` where one is set, except for a team's
 * own message from the inbox, which is answered to its mailbox so the thread holds together.
 */

/** The mails a shopper gets: what E-mail en domein's sender is for. Team, account and platform mails stay Insyte's. */
export const CUSTOMER_MAIL_KINDS = [
  "return.received",
  "return.approved",
  "return.rejected",
  "return.label",
  "return.resolved",
  "order.delayed",
  "support.message"
] as const satisfies ReadonlyArray<MailKind>

/** What the sending rule reads of the stored section; the rest of it is E-mail en domein's own. */
const StoredSenders = Schema.Struct({
  from: Schema.String,
  replyTo: Schema.String,
  domain: Schema.optional(Schema.NullOr(Schema.Struct({ name: Schema.String, verified: Schema.Boolean })))
})

const decode = Schema.decodeUnknownOption(StoredSenders)

/** A plain address, as E-mail en domein's check lets one through: anything else is never put in a header. */
const PLAIN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/

/** What a mail of `kind` is sent with, by the stored section (none: never saved): nothing, Insyte's sender. */
export const sendersFor = (
  stored: unknown,
  kind: MailKind
): { readonly from?: string; readonly replyTo?: string } => {
  if (!(CUSTOMER_MAIL_KINDS as ReadonlyArray<MailKind>).includes(kind)) return {}
  const value = Option.getOrUndefined(decode(stored))
  if (value === undefined) return {}
  const domain = value.domain
  const from = value.from.trim().toLowerCase()
  const onDomain = domain !== null && domain !== undefined && domain.verified && PLAIN.test(from) &&
    from.endsWith(`@${domain.name.toLowerCase()}`)
  const replyTo = value.replyTo.trim().toLowerCase()
  return {
    ...(onDomain ? { from } : {}),
    // The inbox's own messages are answered to their mailbox: that is how the answer finds its thread.
    ...(!PLAIN.test(replyTo) || kind === "support.message" ? {} : { replyTo })
  }
}
