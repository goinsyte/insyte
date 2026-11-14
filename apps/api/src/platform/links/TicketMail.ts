import { ThreadTickets } from "@insyte/modules/inbox/domain/Ports"
import { composeOn, replyOn, restore as restoreInbox } from "@insyte/modules/inbox/use-cases/commands"
import { TicketMail } from "@insyte/modules/tickets/domain/CustomerMail"
import { Effect, Layer } from "effect"
import { threadTickets } from "./ThreadTickets.ts"

/**
 * A ticket's "Klant informeren" → the inbox (M11): a reply in the ticket's thread with the shopper, else a new thread
 * linked to the ticket, on the ticket's transaction; and the inbox's way back for the ticket's undo.
 */
export const ticketMail = TicketMail.of({
  send: (sql, input) =>
    Effect.gen(function*() {
      const q = input.threadId === null
        ? yield* composeOn(sql, {
          to: input.to,
          subject: input.subject,
          body: input.body,
          ticketId: input.ticketId,
          messageId: input.messageId
        })
        : yield* replyOn(sql, { threadId: input.threadId, body: input.body, messageId: input.messageId })
      return {
        threadId: q.threadId,
        messageId: q.messageId,
        to: q.to,
        outboxId: q.outboxId,
        compensation: q.compensation
      }
    }),
  unsend: (sql, compensation) =>
    restoreInbox(sql, compensation).pipe(Effect.provideService(ThreadTickets, threadTickets))
})

export const TicketMailLive = Layer.succeed(TicketMail, ticketMail)
