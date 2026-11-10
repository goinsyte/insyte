import type { ReturnMailFacts } from "@insyte/modules/shared/domain/Mailer"
import type { Urls } from "../../MailUrls.ts"

/*
 * What the shopper's return mails share (M9.3): the facts the relay read, with the portal's address written out from
 * the stage's origin (`MailUrls`), the words for a return or a claim and for what the shopper gets, and the preview's
 * return. In the store's name: the shopper knows the store, not Insyte.
 */

export type ReturnProps = ReturnMailFacts & {
  /** The store's returns portal, where it is on: the one link a return mail carries. */
  readonly portalUrl: string | null
}

type Resolution = NonNullable<ReturnMailFacts["requested"]>

/** "Hallo Anna," from the name on the order, or just "Hallo,". */
export const hello = (customer: string) => {
  const first = customer.trim().split(/\s+/)[0] ?? ""
  return first === "" ? "Hallo," : `Hallo ${first},`
}

/** "je retour R-1042" or "je melding R-1042". */
export const what = (props: Pick<ReturnProps, "kind" | "number">) =>
  `je ${props.kind === "claim" ? "melding" : "retour"} ${props.number}`

/** The lines as the shopper bought them: "1 × Linnen overhemd (M)". */
export const lines = (props: Pick<ReturnProps, "items">) =>
  props.items.map((i) => `${i.qty} × ${i.title}${i.variant ? ` (${i.variant})` : ""}`)

/** What the shopper asked for or gets, as the clause after "je krijgt". */
export const GETS: Record<Resolution, string> = {
  refund: "je geld terug",
  exchange: "een ander exemplaar in ruil",
  gift_card: "een cadeaubon",
  replacement: "een nieuw exemplaar",
  discount: "een kortingscode voor je volgende bestelling"
}

/** Why the shopper gets this mail, signed by the store. */
export const reason = (props: Pick<ReturnProps, "shop">) =>
  `Je krijgt deze mail omdat je bij ${props.shop} iets terugstuurt of een probleem hebt gemeld.`

/** A return as the previews show it, for any origin. */
export const sample = (urls: Urls): ReturnProps => ({
  shop: "Northwind",
  customer: "Anna de Vries",
  number: "R-1042",
  kind: "return",
  orderNumber: "#1002",
  items: [{ title: "Linnen overhemd", variant: "M", qty: 1 }],
  portal: "northwind",
  portalUrl: urls.console("/retour/northwind")
})
