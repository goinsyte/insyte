import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { TicketDetail, TicketList, TicketOptions } from "@insyte/modules/tickets/domain/Tickets"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Tickets (M11 step 3): every ticket the role may see, primed by the route's loader, which the board and the lists
 * pick their view from; one ticket with its activity when its modal opens; what "Nieuw ticket" offers. Every ticket
 * command names `TICKETS`.
 */

export const TICKETS = ["tickets"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const ticketsAtom = Atom.serializable(
  ConsoleClient.query("Tickets.list", {}, { reactivityKeys: TICKETS }),
  { key: "tickets", schema: AsyncResult.Schema({ success: TicketList, error: errors }), skipInitialRun: true }
)

export const ticketOptionsAtom = Atom.serializable(
  ConsoleClient.query("Tickets.options", undefined, { reactivityKeys: TICKETS }),
  { key: "ticket-options", schema: AsyncResult.Schema({ success: TicketOptions, error: errors }), skipInitialRun: true }
)

export const ticketAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Tickets.get", { id }, { reactivityKeys: TICKETS }),
    {
      key: `ticket:${id}`,
      schema: AsyncResult.Schema({ success: TicketDetail, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

/** The area panel's counts, per view and per source, on the tickets pages (ADR-0028). */
export const ticketCountsAtom = ConsoleClient.query("Nav.counts", { area: "tickets" }, { reactivityKeys: TICKETS })

export const ticketWrites = {
  create: ConsoleClient.mutation("Tickets.create"),
  restock: ConsoleClient.mutation("Tickets.restock"),
  duplicate: ConsoleClient.mutation("Tickets.duplicate"),
  update: ConsoleClient.mutation("Tickets.update"),
  setStatus: ConsoleClient.mutation("Tickets.setStatus"),
  assign: ConsoleClient.mutation("Tickets.assign"),
  unassign: ConsoleClient.mutation("Tickets.unassign"),
  archive: ConsoleClient.mutation("Tickets.archive"),
  spam: ConsoleClient.mutation("Tickets.spam"),
  trash: ConsoleClient.mutation("Tickets.trash"),
  snooze: ConsoleClient.mutation("Tickets.snooze"),
  putBack: ConsoleClient.mutation("Tickets.putBack"),
  reorder: ConsoleClient.mutation("Tickets.reorder"),
  watch: ConsoleClient.mutation("Tickets.watch"),
  unwatch: ConsoleClient.mutation("Tickets.unwatch"),
  comment: ConsoleClient.mutation("Tickets.comment"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
