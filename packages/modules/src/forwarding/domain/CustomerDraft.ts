import { Schema } from "effect"
import type { ErrorKind } from "./Forwarding.ts"

/*
 * Forwarding's "Klant mailen" (M8 10.2a; domain.md §5.1): the mail Insyte drafts for the shopper of a leg that went
 * wrong, in the store's name, for the team to read, change and send with `Orders.emailCustomer`. An incomplete address
 * asks for it; a supplier out of stock offers to wait or be refunded; anything else says it takes longer. Nothing is
 * promised that Insyte does not know (no date, no amount).
 */

export interface DraftFacts {
  readonly errorKind: ErrorKind | null
  /** The name on the order. */
  readonly customer: string
  /** `#1003`. */
  readonly number: string
  /** The store's name, which the mail is signed with. */
  readonly shop: string
  /** The leg's first line, as the stock mail names it. */
  readonly line: { readonly title: string; readonly variant: string | null } | null
}

export const customerDraftText = (f: DraftFacts): { readonly subject: string; readonly body: string } => {
  const first = f.customer.trim().split(/\s+/)[0] ?? ""
  const hello = first === "" ? "Hoi," : `Hoi ${first},`
  const what = f.line === null ? "Een artikel" : `${f.line.title}${f.line.variant ? ` (${f.line.variant})` : ""}`
  const news = f.errorKind === "address"
    ? "Om hem te kunnen versturen, missen we een deel van je adres. Kun je het adres even aanvullen door op deze mail te antwoorden?"
    : f.errorKind === "stock"
    ? `${what} is bij onze leverancier helaas net uitverkocht. We kunnen hem alsnog sturen zodra hij er weer is, of je het bedrag meteen terugbetalen. Laat je weten wat je wilt?`
    : "Het versturen duurt helaas langer dan we dachten. We laten het je weten zodra hij onderweg is."
  return {
    subject: `Over je bestelling ${f.number}`,
    body: `${hello}\n\nBedankt voor je bestelling ${f.number}. ${news}\n\nGroet,\n${f.shop}`
  }
}

/** What `Forwarding.customerDraft` answers: who it goes to (null: the order has no address) and the words. */
export class CustomerDraft extends Schema.Class<CustomerDraft>("forwarding/CustomerDraft")({
  legId: Schema.String,
  orderId: Schema.String,
  to: Schema.NullOr(Schema.String),
  subject: Schema.String,
  body: Schema.String
}) {}
