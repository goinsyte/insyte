import { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AssignInput,
  CommentInput,
  CreateInput,
  IdInput,
  IdsInput,
  ListInput,
  MemberNotActive,
  ReorderInput,
  SetStatusInput,
  SnoozeInput,
  TicketChange,
  TicketComment,
  TicketDetail,
  TicketList,
  TicketOptions,
  UpdateInput
} from "@insyte/modules/tickets/domain/Tickets"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Changed = Schema.Union([Forbidden, NotFound])
const Watching = Schema.Struct({ watching: Schema.Boolean })

/**
 * Tickets (M11 step 3): the board and its lists, one ticket with its activity, what "Nieuw ticket" offers, and every
 * change with an undo token (a reorder needs none). Klantenservice · Bekijken to read, Bewerken to change, Beheren for
 * the trash.
 */
export class TicketsRpcs extends RpcGroup.make(
  Rpc.make("Tickets.list", { payload: ListInput, success: TicketList, error: Forbidden }),
  Rpc.make("Tickets.get", { payload: IdInput, success: TicketDetail, error: Changed }),
  Rpc.make("Tickets.options", { success: TicketOptions, error: Forbidden }),
  Rpc.make("Tickets.create", {
    payload: CreateInput,
    success: TicketChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, MemberNotActive])
  }),
  Rpc.make("Tickets.duplicate", {
    payload: IdInput,
    success: TicketChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, MemberNotActive])
  }),
  Rpc.make("Tickets.update", {
    payload: UpdateInput,
    success: TicketChange,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  Rpc.make("Tickets.setStatus", { payload: SetStatusInput, success: TicketChange, error: Changed }),
  Rpc.make("Tickets.assign", {
    payload: AssignInput,
    success: TicketChange,
    error: Schema.Union([Forbidden, NotFound, MemberNotActive])
  }),
  Rpc.make("Tickets.unassign", { payload: AssignInput, success: TicketChange, error: Changed }),
  Rpc.make("Tickets.archive", { payload: IdsInput, success: TicketChange, error: Changed }),
  Rpc.make("Tickets.spam", { payload: IdsInput, success: TicketChange, error: Changed }),
  Rpc.make("Tickets.trash", { payload: IdsInput, success: TicketChange, error: Changed }),
  Rpc.make("Tickets.snooze", {
    payload: SnoozeInput,
    success: TicketChange,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  Rpc.make("Tickets.putBack", { payload: IdsInput, success: TicketChange, error: Changed }),
  Rpc.make("Tickets.reorder", { payload: ReorderInput, success: TicketChange, error: Changed }),
  Rpc.make("Tickets.watch", { payload: IdInput, success: Watching, error: Changed }),
  Rpc.make("Tickets.unwatch", { payload: IdInput, success: Watching, error: Changed }),
  Rpc.make("Tickets.comment", {
    payload: CommentInput,
    success: TicketComment,
    error: Schema.Union([Forbidden, NotFound, MemberNotActive])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
