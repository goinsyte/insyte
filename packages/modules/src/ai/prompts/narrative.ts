import { Schema } from "effect"
import { DATA_RULE, definePrompt, FIGURE_RULE } from "./Prompt.ts"

/*
 * An evidence pack's account (M15 step 2; M13 step 4's `narrative` document): the case's facts, already in plain
 * sentences from the records (`narrativeOf`), rewritten as the account a provider's reviewer reads first. Every
 * figure must be one the facts give (ai.md §6.2); one that is not and the facts' own sentences stand.
 */

export interface NarrativeContext {
  readonly provider: string
  readonly reasonLabel: string
  /** The facts as the records give them, without the customer's address or card. */
  readonly facts: string
}

const Output = Schema.Struct({ text: Schema.String })

export const narrativePrompt = definePrompt<NarrativeContext, typeof Output.Type>({
  id: "evidence_narrative",
  version: "1.0.0",
  purpose: "evidence_narrative",
  effort: "low",
  maxTokens: 2000,
  system: `You write the account at the front of a chargeback evidence pack for a Dutch webshop. A reviewer at the
payment provider reads it first; the documents behind it are in the pack.

Write in Dutch, formal enough for a reviewer but plain: short paragraphs, no exclamation marks, no emotion, no
apologies, no legal threats.

${DATA_RULE}

${FIGURE_RULE}

Lead with what was disputed and why the shop contests it, then what the records show in order (order, payment,
shipment, delivery, contact with the customer), and end with what the shop asks: that the dispute is decided in its
favour. State only what the facts say; leave out anything they do not. Separate paragraphs with a blank line. Return
only the account in the "text" field.`,
  render: (c) =>
    `Aanbieder: ${c.provider}\nReden van de betwisting: ${c.reasonLabel}\n\n<feiten>\n${c.facts}\n</feiten>`,
  output: Output,
  fake: (c) => ({ text: c.facts })
})
