import { Schema } from "effect"

/*
 * The delay mail (M10.2): the shopper hears, in the store's name, that their order is late, and when it is now expected
 * where the carrier or the supplier has said so. Written here, from the order's fields, once: the plate shows these words
 * and filing sends them, so what the operator approved is what the shopper reads.
 */

export interface DelayFacts {
  /** The store's name, which the mail is sent in. */
  readonly shop: string
  /** The name on the order. */
  readonly customer: string
  /** `#1003`. */
  readonly number: string
  readonly items: ReadonlyArray<{ readonly title: string; readonly variant: string | null; readonly qty: number }>
  /** The new expected day, where the carrier's estimate or the supplier's new date gives one. */
  readonly expectedOn: Date | null
  readonly timeZone: string
}

export interface DelayText {
  readonly subject: string
  readonly paragraphs: ReadonlyArray<string>
}

/** "dinsdag 18 november", in the workspace's time zone. */
export const dayOf = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(d)

/** "1 × Linnen overhemd (M)". */
const lineOf = (i: DelayFacts["items"][number]) => `${i.qty} × ${i.title}${i.variant ? ` (${i.variant})` : ""}`

export const delayText = (f: DelayFacts): DelayText => {
  const first = f.customer.trim().split(/\s+/)[0] ?? ""
  const items = f.items.map(lineOf)
  return {
    subject: `Je bestelling ${f.number} is later dan verwacht`,
    paragraphs: [
      first === "" ? "Hallo," : `Hallo ${first},`,
      `Je bestelling ${f.number} bij ${f.shop} is later dan verwacht. ${
        f.expectedOn === null
          ? "We weten nog niet precies wanneer hij bij je is, en laten het je weten zodra we dat wel weten."
          : `We verwachten hem nu op ${dayOf(f.expectedOn, f.timeZone)} bij je.`
      }`,
      ...(items.length === 0 ? [] : [`Het gaat om ${items.join(", ")}.`]),
      "Je hoeft niets te doen. Heb je een vraag, neem dan contact op met de winkel en noem je bestelnummer."
    ]
  }
}

/** The order is not one a delay mail may go for: no longer delayed or open, no address, or the shopper was told. */
export class DelayMailRefused extends Schema.TaggedError<DelayMailRefused>()("DelayMailRefused", {
  orderId: Schema.String,
  reason: Schema.Literals(["not_delayed", "no_email", "already_told"])
}) {}
