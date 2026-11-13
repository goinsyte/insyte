import { Schema } from "effect"
import { dataBlock } from "../domain/Guards.ts"
import { DATA_RULE, definePrompt, FIGURE_RULE, VOICE } from "./Prompt.ts"

/*
 * A reply draft (M15 step 2; widgets/04 inbox draft card and the ticket's "Antwoord voorstellen"): the thread or the
 * ticket, the customer's first name, and the facts of their recent orders, nothing else about them (ai.md §6.4).
 * Warmer and Korter rewrite the draft before it, with the same facts.
 */

export interface ReplyOrder {
  readonly number: string
  /** As the console says it: "Verzonden", "Bezorgd". */
  readonly status: string
  readonly placedOn: string
  readonly carrier: string | null
  readonly trackingNumber: string | null
  readonly deliveredOn: string | null
}

export interface ReplyMessage {
  readonly from: "klant" | "team"
  readonly on: string
  readonly text: string
}

export interface ReplyContext {
  readonly via: "mail" | "ticket"
  /** The store that answers, as the signature names it. */
  readonly brand: string
  readonly firstName: string
  readonly subject: string
  readonly messages: ReadonlyArray<ReplyMessage>
  readonly orders: ReadonlyArray<ReplyOrder>
  /** A ticket's own description: the team's words about it. */
  readonly note: string | null
  /** A rewrite: the draft before it and how to change it. */
  readonly rewrite: { readonly tone: "warmer" | "korter"; readonly previous: string } | null
}

const Output = Schema.Struct({ text: Schema.String })

const orderLine = (o: ReplyOrder): string => {
  const parts = [`Bestelling ${o.number}: ${o.status}, geplaatst op ${o.placedOn}`]
  if (o.carrier !== null) parts.push(`vervoerder ${o.carrier}`)
  if (o.trackingNumber !== null) parts.push(`trackingnummer ${o.trackingNumber}`)
  if (o.deliveredOn !== null) parts.push(`bezorgd op ${o.deliveredOn}`)
  return parts.join(", ")
}

const greeting = (c: ReplyContext) => (c.firstName === "" ? "Hoi," : `Hoi ${c.firstName},`)

/** The fake's first draft: what the record says, and that the team comes back on it. */
const first = (c: ReplyContext): string => {
  const order = c.orders[0]
  const facts = order === undefined
    ? ""
    : ` Je bestelling ${order.number} staat op "${order.status.toLowerCase()}"${
      order.trackingNumber === null ? "" : `, met trackingnummer ${order.trackingNumber}`
    }.`
  return `${
    greeting(c)
  }\n\nBedankt voor je bericht over "${c.subject}".${facts} We kijken het na en laten je weten wat de volgende stap is.\n\nGroet,\n${c.brand}`
}

const fake = (c: ReplyContext): { text: string } => {
  if (c.rewrite === null) return { text: first(c) }
  if (c.rewrite.tone === "korter") {
    const order = c.orders[0]
    return {
      text: `${greeting(c)}\n\n${
        order === undefined ? "We kijken het na" : `We kijken bestelling ${order.number} na`
      } en laten je weten wat de volgende stap is.\n\nGroet,\n${c.brand}`
    }
  }
  return {
    text: c.rewrite.previous.replace(
      /Bedankt voor je bericht over/,
      "Fijn dat je het laat weten, en bedankt voor je geduld met je bericht over"
    )
  }
}

export const replyPrompt = definePrompt<ReplyContext, typeof Output.Type>({
  id: "reply_draft",
  version: "1.0.0",
  purpose: "draft",
  effort: "low",
  maxTokens: 2000,
  system: `You draft customer-service replies for a Dutch webshop's team. A person on the team reads every draft,
edits it if needed and sends it themselves; you never send anything.

${VOICE}

${DATA_RULE}

${FIGURE_RULE}

Write the reply the team would send to the customer's latest message: greet them by first name ("Hoi Sanne,"), answer
what they asked with the order facts given, say what happens next, and sign with the store's name after "Groet,".
Keep it short: at most about 120 words. When the facts do not answer the question, say the team is looking into it;
never guess. Do not mention that you are an AI. Return only the reply text in the "text" field.`,
  render: (c) =>
    [
      `Winkel: ${c.brand}`,
      `Voornaam klant: ${c.firstName === "" ? "(onbekend)" : c.firstName}`,
      `Onderwerp: ${c.subject}`,
      c.note === null ? "" : dataBlock("ticketnotitie", c.note),
      c.orders.length === 0 ? "Bestellingen: geen gevonden." : `Bestellingen:\n${c.orders.map(orderLine).join("\n")}`,
      ...c.messages.map((m) => dataBlock(m.from === "klant" ? "klantbericht" : "teambericht", `${m.on}\n${m.text}`)),
      c.rewrite === null ? "" : dataBlock("vorig_concept", c.rewrite.previous),
      c.rewrite === null
        ? ""
        : c.rewrite.tone === "warmer"
        ? "Herschrijf het vorige concept warmer en persoonlijker, met dezelfde feiten."
        : "Herschrijf het vorige concept korter: alleen wat de klant moet weten, met dezelfde feiten."
    ].filter((line) => line !== "").join("\n\n"),
  output: Output,
  fake
})
