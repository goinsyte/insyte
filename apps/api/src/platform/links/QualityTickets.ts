import { QualityTickets } from "@insyte/modules/quality/domain/Ports"
import { fromCheck, removeFromThread } from "@insyte/modules/tickets/use-cases/commands"
import { Layer } from "effect"

/** A rejected quality check → a ticket with the supplier, and taken away again by the verdict's Undo (M9.4). */
export const qualityTickets = QualityTickets.of({ make: fromCheck, remove: removeFromThread })

export const QualityTicketsLive = Layer.succeed(QualityTickets, qualityTickets)
