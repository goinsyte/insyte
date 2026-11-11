import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { Relay } from "../shared/domain/Outbox.ts"
import type {
  AssignInput,
  ComposeInput,
  ConnectInput,
  ForwardInput,
  LabelInput,
  LinkTicketInput,
  ListInput,
  MailboxDisconnected,
  MailboxView,
  MessageQueued,
  NoMailbox,
  ProviderUnavailable,
  ReadInput,
  ReplyInput,
  SignatureInput,
  SnoozeInput,
  StarInput,
  ThreadChange,
  ThreadCounts,
  ThreadDetail,
  ThreadList,
  TicketLinked
} from "./domain/Inbox.ts"
import { ThreadTickets } from "./domain/Ports.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Mailboxes from "./use-cases/mailboxes.ts"
import * as Threads from "./use-cases/threads.ts"

type R = Db | CurrentPrincipal
type Ids = { readonly ids: ReadonlyArray<string> }
type Id = { readonly id: string }
type Sending = Forbidden | NotFound | Invalid | MailboxDisconnected

/**
 * The inbox slice (M11 steps 1–2): the team's mailboxes, their threads and messages, and every change the inbox
 * screen makes, with an undo token where the design has one. Mail arrives through `use-cases/inbound.ts` (the Worker's
 * `email()` handler) and leaves through `use-cases/send.ts` (the relay's `support` sink).
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class InboxService extends Context.Service<InboxService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<ThreadList, Forbidden, R>
  /** The area panel's counts, for the frame. */
  readonly counts: Effect.Effect<ThreadCounts, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<ThreadDetail, Forbidden | NotFound, R>
  readonly markRead: (input: typeof ReadInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly star: (input: typeof StarInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly label: (input: typeof LabelInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly archive: (input: Ids) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly spam: (input: Ids) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly trash: (input: Ids) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly snooze: (input: typeof SnoozeInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound | Invalid, R>
  readonly putBack: (input: Ids) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly assign: (input: typeof AssignInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly unassign: (input: Id) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly linkTicket: (input: typeof LinkTicketInput.Type) => Effect.Effect<TicketLinked, Forbidden | NotFound, R>
  readonly reply: (input: typeof ReplyInput.Type) => Effect.Effect<MessageQueued, Sending, R>
  readonly forward: (input: typeof ForwardInput.Type) => Effect.Effect<MessageQueued, Sending, R>
  readonly compose: (input: typeof ComposeInput.Type) => Effect.Effect<MessageQueued, Sending | NoMailbox, R>
  readonly mailboxes: Effect.Effect<ReadonlyArray<MailboxView>, Forbidden, R>
  readonly connect: (
    input: typeof ConnectInput.Type
  ) => Effect.Effect<MailboxView, Forbidden | NotFound | Conflict | ProviderUnavailable, R>
  readonly disconnect: (input: Id) => Effect.Effect<MailboxView, Forbidden | NotFound, R>
  readonly setDefault: (input: Id) => Effect.Effect<MailboxView, Forbidden | NotFound | Conflict, R>
  readonly setSignature: (input: typeof SignatureInput.Type) => Effect.Effect<MailboxView, Forbidden | NotFound, R>
}>()("modules/InboxService") {
  // A database that does not answer is a defect, as everywhere. The relay and the tickets link are taken once.
  static readonly layer = Layer.effect(
    InboxService,
    Effect.gen(function*() {
      const relay = yield* Relay
      const tickets = yield* ThreadTickets
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(Relay, relay),
          Effect.provideService(ThreadTickets, tickets),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        list: (input) => run(Threads.list(input)),
        counts: run(Threads.counts()),
        get: (id) => run(Threads.get(id)),
        markRead: (input) => run(Commands.markRead(input)),
        star: (input) => run(Commands.star(input)),
        label: (input) => run(Commands.label(input)),
        archive: ({ ids }) => run(Commands.setAside({ ids, as: "archived" })),
        spam: ({ ids }) => run(Commands.setAside({ ids, as: "spam" })),
        trash: ({ ids }) => run(Commands.setAside({ ids, as: "trash" })),
        snooze: (input) => run(Commands.snooze(input)),
        putBack: (input) => run(Commands.putBack(input)),
        assign: (input) => run(Commands.assign(input)),
        unassign: (input) => run(Commands.unassign(input)),
        linkTicket: (input) => run(Commands.linkTicket(input)),
        reply: (input) => run(Commands.reply(input)),
        forward: (input) => run(Commands.forward(input)),
        compose: (input) => run(Commands.compose(input)),
        mailboxes: run(Mailboxes.list()),
        connect: (input) => run(Mailboxes.connect(input)),
        disconnect: (input) => run(Mailboxes.disconnect(input)),
        setDefault: (input) => run(Mailboxes.setDefault(input)),
        setSignature: (input) => run(Mailboxes.setSignature(input))
      }
    })
  )
}
