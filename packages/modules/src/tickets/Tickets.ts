import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { MailboxDisconnected, NoMailbox } from "../inbox/domain/Inbox.ts"
import { Relay } from "../shared/domain/Outbox.ts"
import type { SearchHit } from "../shared/domain/Search.ts"
import {
  type CustomerEmailed,
  type EmailCustomerInput,
  type NoCustomerAddress,
  TicketMail
} from "./domain/CustomerMail.ts"
import type {
  AssignInput,
  CommentInput,
  CreateInput,
  ListInput,
  MemberNotActive,
  ReorderInput,
  RestockChange,
  RestockInput,
  SetStatusInput,
  SnoozeInput,
  TicketChange,
  TicketComment,
  TicketCounts,
  TicketDetail,
  TicketList,
  TicketOptions,
  UpdateInput
} from "./domain/Tickets.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Comment from "./use-cases/comment.ts"
import * as CustomerMail from "./use-cases/customer-mail.ts"
import * as Tickets from "./use-cases/tickets.ts"

type R = Db | CurrentPrincipal
type Ids = { readonly ids: ReadonlyArray<string> }

/**
 * The tickets slice (M11 step 3): the board and its lists, one ticket with its activity, and every change the screens,
 * `/v1` and MCP make, each with an undo token. Mail, chats and notification delivery outside the console are later
 * steps of M11; a ticket here is made by hand.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class TicketsService extends Context.Service<TicketsService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<TicketList, Forbidden, R>
  /** The area panel's counts, for the frame. */
  readonly counts: Effect.Effect<TicketCounts, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<TicketDetail, Forbidden | NotFound, R>
  /** Matches for `Search.records`; none where the role cannot see the area. */
  readonly search: (q: string, limit: number) => Effect.Effect<ReadonlyArray<SearchHit>, never, R>
  readonly options: Effect.Effect<TicketOptions, Forbidden, R>
  readonly create: (
    input: typeof CreateInput.Type
  ) => Effect.Effect<TicketChange, Forbidden | NotFound | Invalid | MemberNotActive, R>
  readonly restock: (input: typeof RestockInput.Type) => Effect.Effect<RestockChange, Forbidden | NotFound, R>
  readonly duplicate: (id: string) => Effect.Effect<TicketChange, Forbidden | NotFound | Invalid | MemberNotActive, R>
  readonly update: (input: typeof UpdateInput.Type) => Effect.Effect<TicketChange, Forbidden | NotFound | Invalid, R>
  readonly setStatus: (input: typeof SetStatusInput.Type) => Effect.Effect<TicketChange, Forbidden | NotFound, R>
  readonly assign: (
    input: typeof AssignInput.Type
  ) => Effect.Effect<TicketChange, Forbidden | NotFound | MemberNotActive, R>
  readonly unassign: (input: typeof AssignInput.Type) => Effect.Effect<TicketChange, Forbidden | NotFound, R>
  readonly archive: (input: Ids) => Effect.Effect<TicketChange, Forbidden | NotFound, R>
  readonly spam: (input: Ids) => Effect.Effect<TicketChange, Forbidden | NotFound, R>
  readonly trash: (input: Ids) => Effect.Effect<TicketChange, Forbidden | NotFound, R>
  readonly snooze: (input: typeof SnoozeInput.Type) => Effect.Effect<TicketChange, Forbidden | NotFound | Invalid, R>
  readonly putBack: (input: Ids) => Effect.Effect<TicketChange, Forbidden | NotFound, R>
  readonly reorder: (input: typeof ReorderInput.Type) => Effect.Effect<TicketChange, Forbidden | NotFound, R>
  readonly watch: (id: string, on: boolean) => Effect.Effect<{ readonly watching: boolean }, Forbidden | NotFound, R>
  readonly comment: (
    input: typeof CommentInput.Type
  ) => Effect.Effect<TicketComment, Forbidden | NotFound | MemberNotActive, R>
  /** "Klant informeren": the shopper mailed from the team's mailbox, the ticket waiting on their answer; one undo. */
  readonly emailCustomer: (
    input: EmailCustomerInput
  ) => Effect.Effect<
    CustomerEmailed,
    Forbidden | NotFound | Invalid | Conflict | NoCustomerAddress | NoMailbox | MailboxDisconnected,
    R
  >
}>()("modules/TicketsService") {
  // A database that does not answer is a defect, as everywhere. The relay is taken once, for the assignees' notes and
  // the shopper's mail, and the inbox's side of that mail with it.
  static readonly layer = Layer.effect(
    TicketsService,
    Effect.gen(function*() {
      const relay = yield* Relay
      const mail = yield* TicketMail
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(Relay, relay),
          Effect.provideService(TicketMail, mail),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        list: (input) => run(Tickets.list(input)),
        counts: run(Tickets.counts()),
        get: (id) => run(Tickets.get(id)),
        search: (q, limit) => run(Tickets.search(q, limit)),
        options: run(Tickets.options()),
        create: (input) => run(Commands.create(input)),
        restock: (input) => run(Commands.restock(input)),
        duplicate: (id) => run(Commands.duplicate(id)),
        update: (input) => run(Commands.update(input)),
        setStatus: (input) => run(Commands.setStatus(input)),
        assign: (input) => run(Commands.assign(input)),
        unassign: (input) => run(Commands.unassign(input)),
        archive: ({ ids }) => run(Commands.setAside({ ids, as: "archived" })),
        spam: ({ ids }) => run(Commands.setAside({ ids, as: "spam" })),
        trash: ({ ids }) => run(Commands.setAside({ ids, as: "trash" })),
        snooze: (input) => run(Commands.snooze(input)),
        putBack: (input) => run(Commands.putBack(input)),
        reorder: (input) => run(Commands.reorder(input)),
        watch: (id, on) => run(Commands.watch(id, on)),
        comment: (input) => run(Comment.comment(input)),
        emailCustomer: (input) => run(CustomerMail.emailCustomer(input))
      }
    })
  )
}
