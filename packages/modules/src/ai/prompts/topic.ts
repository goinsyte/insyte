import { Schema } from "effect"
import { topicOf } from "../../tickets/domain/Rules.ts"
import { TicketTopic } from "../../tickets/domain/Tickets.ts"
import { dataBlock } from "../domain/Guards.ts"
import { DATA_RULE, definePrompt, MAX_TOKENS } from "./Prompt.ts"

/*
 * A ticket's topic (M15 step 2; replaces M11's keyword rules where a model is set up and the budget allows): one of
 * the five the analytics count, or none. The keyword rules stay: they answer at once when the ticket is made, and
 * whenever there is no model or no budget.
 */

export interface TopicContext {
  readonly title: string
  readonly description: string
}

const Output = Schema.Struct({ topic: Schema.NullOr(TicketTopic) })

export const topicPrompt = definePrompt<TopicContext, typeof Output.Type>({
  id: "ticket_topic",
  version: "1.0.1",
  purpose: "classify",
  effort: "low",
  maxTokens: MAX_TOKENS,
  // Asked in the background after the ticket is saved; the keyword rules' topic stands meanwhile.
  timeoutSeconds: 30,
  system: `You classify a Dutch webshop's customer-service tickets by topic, for the team's analytics.

${DATA_RULE}

Topics:
- where_is_my_order: where an order or parcel is, delivery, tracking, delays, not received.
- returns: sending something back, exchanging, a refund for a return.
- sizing: size or fit.
- payment: paying, invoices, Klarna, iDEAL, a charge, a dispute or chargeback.
- product_question: the product itself: stock, colour, material, how it works, broken on arrival.

Pick the one topic the ticket is mostly about. When none fits, or the text is too thin to tell, answer null.`,
  render: (c) =>
    [dataBlock("titel", c.title), c.description === "" ? "" : dataBlock("beschrijving", c.description)]
      .filter((line) => line !== "").join("\n\n"),
  output: Output,
  fake: (c) => ({ topic: topicOf(c.title, c.description) })
})
