import { ThreadTickets } from "@insyte/modules/inbox/domain/Ports"
import { fromThread, removeFromThread } from "@insyte/modules/tickets/use-cases/commands"
import { numberOf } from "@insyte/modules/tickets/use-cases/tickets"
import { Layer } from "effect"

/** The inbox → a ticket made from a thread, and taken away again (M11 step 2). */
export const threadTickets = ThreadTickets.of({ make: fromThread, remove: removeFromThread, numberOf })

export const ThreadTicketsLive = Layer.succeed(ThreadTickets, threadTickets)
