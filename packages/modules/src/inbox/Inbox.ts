import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { TakenOver, ThreadClosed } from "../shared/domain/ChatChannel.ts"
import { Relay } from "../shared/domain/Outbox.ts"
import type { SearchHit } from "../shared/domain/Search.ts"
import type {
  ChannelChange,
  ChannelIdInput,
  ChannelStatus,
  ChatDraftInput,
  ChatUnavailable,
  ConnectChannelInput,
  HandoverChange,
  ThreadIdInput
} from "./domain/Chat.ts"
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
import { ThreadTickets, WebchatStores, WidgetKeys } from "./domain/Ports.ts"
import { withChannels, withChat } from "./use-cases/chat/lazy.ts"
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
  /** Matches for `Search.records`; none where the role cannot read the inbox. */
  readonly search: (q: string, limit: number) => Effect.Effect<ReadonlyArray<SearchHit>, never, R>
  readonly markRead: (input: typeof ReadInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly star: (input: typeof StarInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly label: (input: typeof LabelInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly archive: (input: Ids) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly spam: (input: Ids) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly trash: (input: Ids) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly snooze: (input: typeof SnoozeInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound | Invalid, R>
  /** `Conflict` (`open_elsewhere`) only where a chat could not come back beside its session's open one. */
  readonly putBack: (input: Ids) => Effect.Effect<ThreadChange, Forbidden | NotFound | Conflict, R>
  readonly assign: (input: typeof AssignInput.Type) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly unassign: (input: Id) => Effect.Effect<ThreadChange, Forbidden | NotFound, R>
  readonly linkTicket: (input: typeof LinkTicketInput.Type) => Effect.Effect<TicketLinked, Forbidden | NotFound, R>
  /** A chat's reply goes to the shopper's widget: refused while another holds it, or once it closed. */
  readonly reply: (
    input: typeof ReplyInput.Type
  ) => Effect.Effect<MessageQueued, Sending | TakenOver | ThreadClosed, R>
  readonly forward: (input: typeof ForwardInput.Type) => Effect.Effect<MessageQueued, Sending, R>
  readonly compose: (input: typeof ComposeInput.Type) => Effect.Effect<MessageQueued, Sending | NoMailbox, R>
  readonly mailboxes: Effect.Effect<ReadonlyArray<MailboxView>, Forbidden, R>
  readonly connect: (
    input: typeof ConnectInput.Type
  ) => Effect.Effect<MailboxView, Forbidden | NotFound | Conflict | ProviderUnavailable, R>
  readonly disconnect: (input: Id) => Effect.Effect<MailboxView, Forbidden | NotFound, R>
  readonly setDefault: (input: Id) => Effect.Effect<MailboxView, Forbidden | NotFound | Conflict, R>
  readonly setSignature: (input: typeof SignatureInput.Type) => Effect.Effect<MailboxView, Forbidden | NotFound, R>
  /** The website chat (M15 step 8): "Overnemen" and "Teruggeven aan Insyte". */
  readonly takeOver: (input: typeof ThreadIdInput.Type) => Effect.Effect<HandoverChange, Forbidden | NotFound, R>
  readonly handBack: (input: typeof ThreadIdInput.Type) => Effect.Effect<HandoverChange, Forbidden | NotFound, R>
  /** The customer agent's draft in a chat: "Versturen" (a reply, with its Undo), "Aanpassen", "Weggooien". */
  readonly sendDraft: (
    input: typeof ChatDraftInput.Type
  ) => Effect.Effect<HandoverChange, Forbidden | NotFound | Conflict | Invalid | TakenOver | ThreadClosed, R>
  readonly useDraft: (
    input: typeof ChatDraftInput.Type
  ) => Effect.Effect<HandoverChange, Forbidden | NotFound | Conflict, R>
  readonly discardDraft: (
    input: typeof ChatDraftInput.Type
  ) => Effect.Effect<HandoverChange, Forbidden | NotFound | Conflict, R>
  /** The stores' chat channels, at Koppelingen and in the inbox's panel. */
  readonly channels: Effect.Effect<ChannelStatus, Forbidden, R>
  readonly connectChannel: (
    input: typeof ConnectChannelInput.Type
  ) => Effect.Effect<ChannelChange, Forbidden | NotFound | Invalid | ChatUnavailable, R>
  readonly disconnectChannel: (
    input: typeof ChannelIdInput.Type
  ) => Effect.Effect<ChannelChange, Forbidden | NotFound, R>
}>()("modules/InboxService") {
  // A database that does not answer is a defect, as everywhere. The relay and the tickets link are taken once.
  static readonly layer = Layer.effect(
    InboxService,
    Effect.gen(function*() {
      const relay = yield* Relay
      const tickets = yield* ThreadTickets
      const keys = yield* WidgetKeys
      const stores = yield* WebchatStores
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(Relay, relay),
          Effect.provideService(ThreadTickets, tickets),
          Effect.provideService(WidgetKeys, keys),
          Effect.provideService(WebchatStores, stores),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        list: (input) => run(Threads.list(input)),
        counts: run(Threads.counts()),
        get: (id) => run(Threads.get(id)),
        search: (q, limit) => run(Threads.search(q, limit)),
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
        setSignature: (input) => run(Mailboxes.setSignature(input)),
        // The website chat's own code loads with its first call (`lazy.ts`).
        takeOver: (input) => run(withChat((c) => c.takeOver(input))),
        handBack: (input) => run(withChat((c) => c.handBack(input))),
        sendDraft: (input) => run(withChat((c) => c.sendDraft(input))),
        useDraft: (input) => run(withChat((c) => c.useDraft(input))),
        discardDraft: (input) => run(withChat((c) => c.discardDraft(input))),
        channels: run(withChannels((c) => c.status())),
        connectChannel: (input) => run(withChannels((c) => c.connect(input))),
        disconnectChannel: (input) => run(withChannels((c) => c.disconnect(input)))
      }
    })
  )
}
