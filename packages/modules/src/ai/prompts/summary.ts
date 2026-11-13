import { Schema } from "effect"
import { dataBlock } from "../domain/Guards.ts"
import { DATA_RULE, definePrompt, FIGURE_RULE, MAX_TOKENS, VOICE } from "./Prompt.ts"

/*
 * Summaries (M15 step 2; widgets/04 the ticket's "Samenvatten"): for the team, not the customer. A ticket's lands in
 * its activity as Insyte's line; a thread's is kept beside it.
 */

export interface TicketSummaryContext {
  readonly number: number
  readonly title: string
  readonly description: string
  /** As the board says it: "Nieuw", "Bezig". */
  readonly status: string
  readonly priority: string
  /** First names of who has it; empty is "niet toegewezen". */
  readonly assignees: ReadonlyArray<string>
  /** Newest last. */
  readonly notes: ReadonlyArray<{ readonly by: string; readonly text: string }>
  readonly related: string | null
}

export interface ThreadSummaryContext {
  readonly subject: string
  /** Oldest first. */
  readonly messages: ReadonlyArray<{ readonly from: "klant" | "team"; readonly on: string; readonly text: string }>
}

const Output = Schema.Struct({ text: Schema.String })

const SYSTEM = `You summarise customer-service work for a Dutch webshop's team, who read the summary instead of the
whole history.

${VOICE}

${DATA_RULE}

${FIGURE_RULE}

Write two or three sentences: what it is about, where it stands, and what is still open. Name people by first name
only. Return only the summary in the "text" field.`

export const ticketSummaryPrompt = definePrompt<TicketSummaryContext, typeof Output.Type>({
  id: "ticket_summary",
  version: "1.1.0",
  purpose: "summarize",
  effort: "low",
  maxTokens: MAX_TOKENS,
  system: SYSTEM,
  render: (c) =>
    [
      `Ticket #${c.number}:`,
      dataBlock("titel", c.title),
      `Status: ${c.status}. Prioriteit: ${c.priority}.`,
      `Toegewezen aan: ${c.assignees.length === 0 ? "niemand" : c.assignees.join(", ")}`,
      c.related === null ? "" : `Gaat over: ${c.related}`,
      c.description === "" ? "" : dataBlock("beschrijving", c.description),
      `Notities: ${c.notes.length}`,
      ...c.notes.map((n) => dataBlock("notitie", `${n.by}: ${n.text}`))
    ].filter((line) => line !== "").join("\n\n"),
  output: Output,
  fake: (c) => {
    const who = c.assignees.length === 0 ? "niet toegewezen" : `bij ${c.assignees.join(" en ")}`
    const last = c.notes.at(-1)?.text ?? c.description
    const notes = `${c.notes.length} ${c.notes.length === 1 ? "notitie" : "notities"} tot nu toe`
    return {
      text: `${c.title}. ${c.status}, prioriteit ${c.priority.toLowerCase()}, ${who}. ${notes}${
        last === "" ? "." : `; de laatste: "${last.slice(0, 200)}"`
      }`
    }
  }
})

export const threadSummaryPrompt = definePrompt<ThreadSummaryContext, typeof Output.Type>({
  id: "thread_summary",
  version: "1.1.0",
  purpose: "summarize",
  effort: "low",
  maxTokens: MAX_TOKENS,
  system: SYSTEM,
  render: (c) =>
    [
      dataBlock("onderwerp", c.subject),
      `Berichten: ${c.messages.length}`,
      ...c.messages.map((m) => dataBlock(m.from === "klant" ? "klantbericht" : "teambericht", `${m.on}\n${m.text}`))
    ].join("\n\n"),
  output: Output,
  fake: (c) => {
    const theirs = c.messages.filter((m) => m.from === "klant")
    const last = theirs[theirs.length - 1]
    const n = c.messages.length
    return {
      text: `${n} ${n === 1 ? "bericht" : "berichten"} over "${c.subject}".${
        last === undefined ? "" : ` De klant schreef als laatste op ${last.on}: "${last.text.slice(0, 160)}"`
      }`
    }
  }
})
