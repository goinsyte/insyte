import { TicketsRpcs } from "@insyte/api/rpc/TicketsRpcs"
import { TicketsService } from "@insyte/modules/tickets/Tickets"
import { Effect } from "effect"

export const TicketsHandlers = TicketsRpcs.toLayer(Effect.gen(function*() {
  const tickets = yield* TicketsService
  return TicketsRpcs.of({
    "Tickets.list": (input) => tickets.list(input),
    "Tickets.get": ({ id }) => tickets.get(id),
    "Tickets.options": () => tickets.options,
    "Tickets.create": (input) => tickets.create(input),
    "Tickets.restock": (input) => tickets.restock(input),
    "Tickets.duplicate": ({ id }) => tickets.duplicate(id),
    "Tickets.update": (input) => tickets.update(input),
    "Tickets.setStatus": (input) => tickets.setStatus(input),
    "Tickets.assign": (input) => tickets.assign(input),
    "Tickets.unassign": (input) => tickets.unassign(input),
    "Tickets.archive": (input) => tickets.archive(input),
    "Tickets.spam": (input) => tickets.spam(input),
    "Tickets.trash": (input) => tickets.trash(input),
    "Tickets.snooze": (input) => tickets.snooze(input),
    "Tickets.putBack": (input) => tickets.putBack(input),
    "Tickets.reorder": (input) => tickets.reorder(input),
    "Tickets.watch": ({ id }) => tickets.watch(id, true),
    "Tickets.unwatch": ({ id }) => tickets.watch(id, false),
    "Tickets.comment": (input) => tickets.comment(input),
    "Tickets.emailCustomer": (input) => tickets.emailCustomer(input)
  })
}))
