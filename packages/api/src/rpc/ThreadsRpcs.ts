import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AssignInput,
  ComposeInput,
  ConnectInput,
  ForwardInput,
  IdInput,
  IdsInput,
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
  ThreadDetail,
  ThreadList,
  TicketLinked
} from "@insyte/modules/inbox/domain/Inbox"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Changed = Schema.Union([Forbidden, NotFound])
const Sending = Schema.Union([Forbidden, NotFound, Invalid, MailboxDisconnected])

/**
 * The inbox (M11 steps 1–2): its threads, one thread with its messages, every change the inbox screen makes (with an
 * undo token where the design has one), what the team sends, and the mailboxes. Klantenservice · Bekijken to read,
 * Bewerken to change and send, Beheren for the mailboxes.
 */
export class ThreadsRpcs extends RpcGroup.make(
  Rpc.make("Threads.list", { payload: ListInput, success: ThreadList, error: Forbidden }),
  Rpc.make("Threads.get", { payload: IdInput, success: ThreadDetail, error: Changed }),
  Rpc.make("Threads.markRead", { payload: ReadInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.star", { payload: StarInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.label", { payload: LabelInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.archive", { payload: IdsInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.spam", { payload: IdsInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.trash", { payload: IdsInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.snooze", {
    payload: SnoozeInput,
    success: ThreadChange,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  Rpc.make("Threads.putBack", { payload: IdsInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.assign", { payload: AssignInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.unassign", { payload: IdInput, success: ThreadChange, error: Changed }),
  Rpc.make("Threads.linkTicket", { payload: LinkTicketInput, success: TicketLinked, error: Changed }),
  Rpc.make("Threads.reply", { payload: ReplyInput, success: MessageQueued, error: Sending }),
  Rpc.make("Threads.forward", { payload: ForwardInput, success: MessageQueued, error: Sending }),
  Rpc.make("Threads.compose", {
    payload: ComposeInput,
    success: MessageQueued,
    error: Schema.Union([Forbidden, NotFound, Invalid, MailboxDisconnected, NoMailbox])
  }),
  Rpc.make("Mailboxes.list", { success: Schema.Array(MailboxView), error: Forbidden }),
  Rpc.make("Mailboxes.connect", {
    payload: ConnectInput,
    success: MailboxView,
    error: Schema.Union([Forbidden, NotFound, Conflict, ProviderUnavailable])
  }),
  Rpc.make("Mailboxes.disconnect", { payload: IdInput, success: MailboxView, error: Changed }),
  Rpc.make("Mailboxes.setDefault", {
    payload: IdInput,
    success: MailboxView,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Mailboxes.setSignature", { payload: SignatureInput, success: MailboxView, error: Changed })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
