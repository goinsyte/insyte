import { Atom } from "effect/reactivity"
import { ConsoleClient } from "./client.ts"

/*
 * Insyte AI's drafts (M15 step 2): a thread's or a ticket's latest reply draft while it still answers the customer's
 * last message, and the writes that ask for one, rewrite it, take it, and summarise. Every write names `DRAFTS`; a
 * ticket's summary names the ticket's too, since it lands in its activity.
 */

export const DRAFTS = ["drafts"] as const

/** `thread:<id>` or `ticket:<id>`. */
export const latestDraftAtom = Atom.family((key: string) => {
  const at = key.indexOf(":")
  const type = key.slice(0, at) === "ticket" ? "ticket" as const : "thread" as const
  return ConsoleClient.query("Drafts.forSubject", { subject: { type, id: key.slice(at + 1) } }, {
    reactivityKeys: DRAFTS
  })
})

/** Whether Insyte AI is switched on for this stage; it changes only with a deploy. */
export const aiStatusAtom = ConsoleClient.query("Drafts.status", undefined).pipe(Atom.keepAlive)

export const draftWrites = {
  reply: ConsoleClient.mutation("Drafts.reply"),
  use: ConsoleClient.mutation("Drafts.use"),
  summarizeTicket: ConsoleClient.mutation("Drafts.summarizeTicket")
}
